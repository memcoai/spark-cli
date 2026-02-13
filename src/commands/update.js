import { execSync } from 'node:child_process';
import { getLocalVersion } from '../update-check.js';
import { printError, printInfo, createSpinner } from '../banner.js';

/**
 * spark update — self-update to the latest version.
 */
export async function updateCommand() {
  const currentVersion = getLocalVersion();
  printInfo(`Current version: v${currentVersion}`);

  const spinner = createSpinner('Updating @memco/spark...');

  try {
    execSync('npm install -g @memco/spark@latest', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });

    const newVersion = getLocalVersion();

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
