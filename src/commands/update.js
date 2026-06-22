import { execSync } from 'node:child_process';
import { getLocalVersion, getInitData, fetchSkillsVersion } from '../update-check.js';
import { printError, printInfo, printWarning, createSpinner } from '../banner.js';
import {
  SETTINGS_PATH,
  LOCAL_SETTINGS_PATH,
  getVariantKey,
  resolveVariant,
  getMarketplaceName,
} from '../constants.js';
import { writeSettingsKey, readSettingsKey } from '../settings.js';
import { runCommand, runInteractiveCommand } from '../exec.js';
import { detectVariant, ensureCorrectVariant } from '../variant.js';

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

  if (ides.includes('claude')) {
    const spinner = createSpinner('Updating Spark plugin for Claude Code...');
    try {
      await exec('claude', ['plugin', 'update', variant.claudePlugin]);
      spinner.stop('Spark plugin updated for Claude Code');
    } catch (err) {
      allSucceeded = false;
      spinner.fail('Failed to update Spark plugin for Claude Code');
      printWarning(err.stderr?.trim() || err.message);
    }
  }

  if (ides.includes('codex')) {
    const spinner = createSpinner('Updating Spark plugin for Codex...');
    try {
      await exec('codex', ['plugin', 'marketplace', 'upgrade', getMarketplaceName(variant)]);
      spinner.stop('Spark plugin updated for Codex');
    } catch (err) {
      allSucceeded = false;
      spinner.fail('Failed to update Spark plugin for Codex');
      printWarning(err.stderr?.trim() || err.message);
    }
  }

  if (ides.includes('other')) {
    printInfo('Updating Spark skills for Cursor/Windsurf...');
    try {
      await spawnInteractive('npx', ['skills', 'update', variant.skillsRepo]);
      printInfo('Spark skills updated for Cursor/Windsurf');
    } catch (err) {
      allSucceeded = false;
      printWarning(`Failed to update skills: ${err.message}`);
    }
  }

  // Only update stored skills version when all updates succeeded,
  // otherwise future update notifications would be suppressed incorrectly
  if (allSucceeded) {
    await persistSkillsVersion(variant, { fetchVersion, readKey, writeKey });
  }
}

/**
 * Core update logic, accepts dependencies for testability.
 */
export async function runUpdate({
  exec = execSync,
  getVersion = getLocalVersion,
  skills = updateSkills,
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

    // Clear cached compatibility and version data so the next run gets a fresh check
    writeSettingsKey(SETTINGS_PATH, 'compatibility', null);
    writeSettingsKey(SETTINGS_PATH, 'latestVersion', null);

    if (newVersion === currentVersion) {
      spinner.stop(`Already on the latest version (v${currentVersion})`);
    } else {
      spinner.stop(`Updated @memco/spark: v${currentVersion} → v${newVersion}`);
    }
  } catch (err) {
    spinner.fail('Update failed');

    if (err.code === 'ENOENT') {
      printError('npm is not installed or not in PATH');
    } else if (err.code === 'EACCES') {
      printError('Permission denied. Try running with sudo: sudo spark update');
    } else if (err.stderr?.trim()) {
      printError(err.stderr.trim());
    } else {
      printError(err.message);
    }

    process.exit(1);
    return;
  }

  // Update skills after successful CLI update
  await skills();
}

/**
 * spark update — self-update to the latest version and update skills.
 */
export async function updateCommand() {
  return runUpdate();
}
