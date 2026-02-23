import { execSync, execFile, spawn } from 'node:child_process';
import { printError, printInfo, printWarning, createSpinner } from '../banner.js';
import { readSettingsKey } from '../settings.js';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH } from '../constants.js';

/**
 * Run a command via execFile. Returns a promise with { stdout, stderr }.
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 60000, ...options }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Run a command interactively with stdio inherited.
 */
function runInteractiveCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });
}

/**
 * Read saved init choices. Returns { initData, scope } or null.
 * Checks local settings first, then global.
 */
function getInitChoices(readKey = readSettingsKey) {
  const localInit = readKey(LOCAL_SETTINGS_PATH, 'init');
  if (localInit?.ides?.length) {
    return { initData: localInit, scope: 'project' };
  }

  const globalInit = readKey(SETTINGS_PATH, 'globalInit');
  if (globalInit?.ides?.length) {
    return { initData: globalInit, scope: 'global' };
  }

  return null;
}

/**
 * Uninstall Claude Code plugin if it was installed via spark init.
 */
async function uninstallClaudePlugin(scope, { exec = runCommand } = {}) {
  const scopeFlag = scope === 'project' ? 'project' : 'user';

  const spinner = createSpinner('Removing Spark plugin from Claude Code...');
  try {
    await exec('claude', ['plugin', 'uninstall', 'spark-cli@MemCo', '--scope', scopeFlag]);
    spinner.stop('Spark plugin removed from Claude Code');
  } catch (err) {
    spinner.fail('Failed to remove Claude Code plugin');
    printWarning(err.stderr?.trim() || err.message);
    printInfo(
      `You can remove it manually: claude plugin uninstall spark-cli@MemCo --scope ${scopeFlag}`,
    );
  }
}

/**
 * Uninstall skills for other IDEs (Cursor, Windsurf, etc.) via skills CLI.
 */
async function uninstallOtherIDEs(scope, { spawnInteractive = runInteractiveCommand } = {}) {
  const args = ['skills', 'remove', 'memcoai/spark-cli-skills'];
  if (scope === 'global') {
    args.push('--global');
  }

  const globalFlag = scope === 'global' ? ' --global' : '';
  printInfo(`Running: npx skills remove memcoai/spark-cli-skills${globalFlag}`);
  console.log('');

  try {
    await spawnInteractive('npx', args);
    console.log('');
    printInfo('Spark skills removed');
  } catch (err) {
    console.log('');
    printWarning(`Failed to remove skills: ${err.message}`);
    printInfo(`You can remove manually: npx skills remove memcoai/spark-cli-skills${globalFlag}`);
  }
}

/**
 * Core uninstall logic, accepts dependencies for testability.
 */
export async function runUninstall({
  exec = execSync,
  execAsync = runCommand,
  spawnInteractive = runInteractiveCommand,
  readKey = readSettingsKey,
} = {}) {
  // Uninstall IDE plugins/skills if they were installed via spark init
  const choices = getInitChoices(readKey);
  if (choices) {
    const { initData, scope } = choices;

    if (initData.ides.includes('claude')) {
      await uninstallClaudePlugin(scope, { exec: execAsync });
    }

    if (initData.ides.includes('other')) {
      await uninstallOtherIDEs(scope, { spawnInteractive });
    }

    console.log('');
  }

  // Uninstall CLI itself
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
