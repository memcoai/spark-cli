import { execSync } from 'node:child_process';
import { printError, printInfo, createSpinner } from '../banner.js';

/**
 * Core uninstall logic, accepts dependencies for testability.
 */
export async function runUninstall({ exec = execSync } = {}) {
  printInfo('Uninstalling @memco/spark...');

  const spinner = createSpinner('Uninstalling @memco/spark...');

  try {
    exec('npm uninstall -g @memco/spark', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });

    spinner.stop('Successfully uninstalled @memco/spark');
  } catch (err) {
    spinner.fail('Uninstall failed');

    if (err.code === 'ENOENT') {
      printError('npm is not installed or not in PATH');
    } else if (err.code === 'EACCES') {
      printError('Permission denied. Try running with sudo: sudo spark uninstall');
    } else if (err.stderr?.trim()) {
      printError(err.stderr.trim());
    } else {
      printError(err.message);
    }

    process.exit(1);
  }
}

/**
 * spark uninstall — remove Spark CLI from this system.
 */
export async function uninstallCommand() {
  return runUninstall();
}
