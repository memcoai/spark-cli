import { execSync } from 'node:child_process';
import { getLocalVersion, getInitData, fetchSkillsVersion } from '../update-check.js';
import { printError, printInfo, printWarning, createSpinner } from '../banner.js';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH, getVariantKey, resolveVariant } from '../constants.js';
import { writeSettingsKey, readSettingsKey } from '../settings.js';
import { runCommand, runInteractiveCommand } from '../exec.js';
import { detectVariant, ensureCorrectVariant } from '../variant.js';

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

  // Ensure correct variant before updating (auto-swap if mismatched)
  const swappedVariant = await ensureVariant({ exec, spawnInteractive });
  // Prefer stored variant from init data when detection is unavailable (e.g. unauthenticated),
  // only fall back to detectVariant() if no stored variant exists.
  const variant = swappedVariant || resolveVariant(initData.variant) || (await detect());
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
  if (!allSucceeded) return;

  try {
    const versionInfo = await fetchVersion(variant.skillsVersionUrl);
    const variantKey = getVariantKey(variant);
    if (versionInfo?.version) {
      const local = readKey(LOCAL_SETTINGS_PATH, 'init');
      if (local?.ides?.length) {
        writeKey(LOCAL_SETTINGS_PATH, 'init', {
          ...local,
          skillsVersion: versionInfo.version,
          variant: variantKey,
        });
      }
      const global = readKey(SETTINGS_PATH, 'globalInit');
      if (global?.ides?.length) {
        writeKey(SETTINGS_PATH, 'globalInit', {
          ...global,
          skillsVersion: versionInfo.version,
          variant: variantKey,
        });
      }
    }
  } catch {
    // Non-critical — version will be refreshed on next check
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
