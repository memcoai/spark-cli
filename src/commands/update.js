import { execSync } from 'node:child_process';
import { getLocalVersion } from '../update-check.js';
import { printError, printInfo, createSpinner } from '../banner.js';
import { SETTINGS_PATH } from '../constants.js';
import { writeSettingsKey } from '../settings.js';

/**
 * Core update logic, accepts dependencies for testability.
 */
export async function runUpdate({ exec = execSync, getVersion = getLocalVersion } = {}) {
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
    printError(err.stderr?.trim() || err.message);
    process.exit(1);
  }
}

/**
 * spark update — self-update to the latest version.
 */
export async function updateCommand() {
  return runUpdate();
}
