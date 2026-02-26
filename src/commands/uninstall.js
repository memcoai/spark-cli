import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { printError, printInfo, printWarning, createSpinner } from '../banner.js';
import { readSettingsKey, writeSettingsKey } from '../settings.js';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH, SPARK_DIR, LOCAL_SPARK_DIR } from '../constants.js';
import { runCommand, runInteractiveCommand } from '../exec.js';

/**
 * Read saved init choices. Returns { initData, scope, settingsPath, settingsKey } or null.
 * Checks local settings first, then global.
 */
function getInitChoices(readKey = readSettingsKey) {
  const localInit = readKey(LOCAL_SETTINGS_PATH, 'init');
  if (localInit?.ides?.length) {
    return {
      initData: localInit,
      scope: 'project',
      settingsPath: LOCAL_SETTINGS_PATH,
      settingsKey: 'init',
    };
  }

  const globalInit = readKey(SETTINGS_PATH, 'globalInit');
  if (globalInit?.ides?.length) {
    return {
      initData: globalInit,
      scope: 'global',
      settingsPath: SETTINGS_PATH,
      settingsKey: 'globalInit',
    };
  }

  return null;
}

/**
 * Remove the init data from the settings file after IDE uninstalls.
 * For project scope, also removes the project entry from the global projects array.
 */
export function removeInitData(
  settingsPath,
  settingsKey,
  { readKey = readSettingsKey, writeKey = writeSettingsKey } = {},
) {
  writeKey(settingsPath, settingsKey, null);

  if (settingsKey === 'init') {
    // Also remove from global projects array
    const projects = readKey(SETTINGS_PATH, 'projects');
    if (Array.isArray(projects)) {
      const cwd = process.cwd();
      const filtered = projects.filter((p) => p.path !== cwd);
      writeKey(SETTINGS_PATH, 'projects', filtered.length > 0 ? filtered : null);
    }
  }
}

/**
 * Remove .spark directories (global and local) after successful uninstall.
 */
function cleanupSparkDirs(rm = rmSync) {
  for (const dir of [LOCAL_SPARK_DIR, SPARK_DIR]) {
    try {
      rm(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — don't fail uninstall if directories can't be removed
    }
  }
}

/**
 * Uninstall Claude Code plugin if it was installed via spark init.
 */
export async function uninstallClaudePlugin(scope, { exec = runCommand } = {}) {
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
export async function uninstallOtherIDEs(scope, { spawnInteractive = runInteractiveCommand } = {}) {
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
  writeKey = writeSettingsKey,
  rm = rmSync,
} = {}) {
  // Uninstall IDE plugins/skills if they were installed via spark init
  const choices = getInitChoices(readKey);
  if (choices) {
    const { initData, scope, settingsPath, settingsKey } = choices;

    if (initData.ides.includes('claude')) {
      await uninstallClaudePlugin(scope, { exec: execAsync });
    }

    if (initData.ides.includes('other')) {
      await uninstallOtherIDEs(scope, { spawnInteractive });
    }

    removeInitData(settingsPath, settingsKey, { readKey, writeKey });

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

    // Clean up .spark directories
    cleanupSparkDirs(rm);
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
