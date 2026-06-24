import { execSync } from 'node:child_process';
import semver from 'semver';
import {
  getLocalVersion,
  getInitData,
  fetchSkillsVersion,
  fetchLatestVersion,
  coerceVersion,
} from '../update-check.js';
import { printError, printInfo, printWarning, createSpinner } from '../banner.js';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH, getVariantKey, resolveVariant } from '../constants.js';
import { writeSettingsKey, readSettingsKey } from '../settings.js';
import { runCommand, runInteractiveCommand, printNpmError } from '../exec.js';
import { detectVariant, ensureCorrectVariant } from '../variant.js';
import { IDES } from '../ides.js';

/**
 * Resolve the variant to use for skills updates.
 * Prefers a swapped variant, then stored variant, then detects from API.
 */
async function resolveSkillsVariant(initData, { exec, spawnInteractive, detect, ensureVariant }) {
  const swappedVariant = await ensureVariant({ exec, spawnInteractive });
  const variant = swappedVariant || resolveVariant(initData.variant);
  if (variant) return variant;

  try {
    return await detect();
  } catch {
    printError('Could not detect variant: not authenticated or API unavailable.');
    return null;
  }
}

/**
 * Persist the latest skills version to local and global init data after a successful update.
 */
async function persistSkillsVersion(variant, { fetchVersion, readKey, writeKey }) {
  try {
    const variantKey = getVariantKey(variant);
    const versionInfo = await fetchVersion(variantKey);
    if (!versionInfo?.version) return;
    const updates = [
      [LOCAL_SETTINGS_PATH, 'init'],
      [SETTINGS_PATH, 'globalInit'],
    ];

    for (const [path, key] of updates) {
      const data = readKey(path, key);
      if (data?.ides?.length) {
        writeKey(path, key, { ...data, skillsVersion: versionInfo.version, variant: variantKey });
      }
    }
  } catch {
    // Non-critical — version will be refreshed on next check
  }
}

/**
 * Update skills for configured IDEs.
 * Reads init data to determine which IDEs are set up, then runs the appropriate
 * update commands. Failures are warnings — they never abort the overall update.
 */
export async function updateSkills({
  getInit = getInitData,
  exec = runCommand,
  spawnInteractive = runInteractiveCommand,
  fetchVersion = fetchSkillsVersion,
  writeKey = writeSettingsKey,
  readKey = readSettingsKey,
  detect = detectVariant,
  ensureVariant = ensureCorrectVariant,
} = {}) {
  const initData = getInit();
  if (!initData?.ides?.length) return;

  const variant = await resolveSkillsVariant(initData, {
    exec,
    spawnInteractive,
    detect,
    ensureVariant,
  });
  if (!variant) return;

  const ides = initData.ides;
  let allSucceeded = true;

  // Each descriptor's `update` hook owns its IDE-specific spinner/info copy and command
  // (Codex upgrades via `plugin marketplace upgrade`, others via a plain update). The hooks
  // share these UI primitives and report success so the allSucceeded gate stays accurate.
  for (const ide of IDES) {
    if (!ides.includes(ide.key)) continue;
    const ok = await ide.update({
      exec,
      spawnInteractive,
      variant,
      spinner: createSpinner,
      info: printInfo,
      warn: printWarning,
    });
    if (!ok) allSucceeded = false;
  }

  // Only update stored skills version when all updates succeeded,
  // otherwise future update notifications would be suppressed incorrectly
  if (allSucceeded) {
    await persistSkillsVersion(variant, { fetchVersion, readKey, writeKey });
  }
}

/**
 * Detect when npm declined to upgrade even though a newer version is published.
 *
 * `npm install` silently keeps the current version when an install-window setting
 * (min-release-age / before) holds back recently published releases. The npm registry
 * `latest` tag is unaffected by those client-side settings, so comparing it against the
 * installed version reveals an upgrade that npm chose not to apply.
 *
 * Returns the newer version string, or null if none is available or the check fails
 * (fail open — the caller falls back to the standard "already latest" message).
 */
async function getHeldBackVersion(installedVersion, fetchLatest) {
  try {
    const latestInfo = await fetchLatest();
    const latest = coerceVersion(latestInfo?.version);
    const installed = coerceVersion(installedVersion);
    if (latest && installed && semver.gt(latest, installed)) {
      return latestInfo.version;
    }
  } catch {
    // Network/parse failure — treat as "no newer version known".
  }
  return null;
}

/**
 * Core update logic, accepts dependencies for testability.
 */
export async function runUpdate({
  exec = execSync,
  getVersion = getLocalVersion,
  skills = updateSkills,
  fetchLatest = fetchLatestVersion,
} = {}) {
  const currentVersion = getVersion();
  printInfo(`Current version: v${currentVersion}`);

  const spinner = createSpinner('Updating @memco/spark...');

  try {
    exec('npm install -g @memco/spark@latest', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });

    const newVersion = getVersion();

    if (newVersion === currentVersion) {
      // npm may keep the current version even when a newer one is published — an install-window
      // setting (min-release-age / before) holds back recent releases. Distinguish that from
      // genuinely being up to date so the message isn't misleading. Caches are intentionally left
      // intact here: the version is unchanged (so compatibility still applies) and getHeldBackVersion
      // has just refreshed the latestVersion cache.
      const heldBackVersion = await getHeldBackVersion(newVersion, fetchLatest);
      if (heldBackVersion) {
        spinner.fail(
          `npm kept v${currentVersion} — v${heldBackVersion} is available but was not installed`,
        );
        printWarning(
          'npm is configured to hold back recently published releases, so the newer version was\n' +
            'skipped as too recent. It will install normally once it ages past the window. To install\n' +
            'it now, override the install window:\n' +
            '  npm install -g @memco/spark@latest --min-release-age=0\n' +
            'If you instead pin installs to a date with `before`, raise or remove that setting.',
        );
      } else {
        spinner.stop(`Already on the latest version (v${currentVersion})`);
      }
    } else {
      spinner.stop(`Updated @memco/spark: v${currentVersion} → v${newVersion}`);
      // Clear cached compatibility and version data so the next run re-checks against the new version.
      writeSettingsKey(SETTINGS_PATH, 'compatibility', null);
      writeSettingsKey(SETTINGS_PATH, 'latestVersion', null);
    }
  } catch (err) {
    spinner.fail('Update failed');

    printNpmError(err, 'update');

    process.exit(1);
    return;
  }

  // Update skills after successful CLI update
  await skills();
}
