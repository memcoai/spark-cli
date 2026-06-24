import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { printInfo, printWarning, createSpinner } from '../banner.js';
import { readSettingsKey, writeSettingsKey } from '../settings.js';
import {
  SETTINGS_PATH,
  LOCAL_SETTINGS_PATH,
  SPARK_DIR,
  LOCAL_SPARK_DIR,
  VARIANTS,
  resolveVariant,
} from '../constants.js';
import { runCommand, runInteractiveCommand, printNpmError } from '../exec.js';
import { IDES } from '../ides.js';

/**
 * Collect all init targets to clean up during uninstall.
 * Returns an array of { initData, scope, settingsPath, settingsKey, cwd } objects.
 * Checks local init, global init, and all entries in the global projects array.
 */
export function getAllInitTargets(readKey = readSettingsKey) {
  const targets = [];
  const cwd = process.cwd();

  const localInit = readKey(LOCAL_SETTINGS_PATH, 'init');
  if (localInit?.ides?.length) {
    targets.push({
      initData: localInit,
      scope: 'project',
      settingsPath: LOCAL_SETTINGS_PATH,
      settingsKey: 'init',
    });
  }

  const globalInit = readKey(SETTINGS_PATH, 'globalInit');
  if (globalInit?.ides?.length) {
    targets.push({
      initData: globalInit,
      scope: 'global',
      settingsPath: SETTINGS_PATH,
      settingsKey: 'globalInit',
    });
  }

  const projects = readKey(SETTINGS_PATH, 'projects');
  if (Array.isArray(projects)) {
    for (const project of projects) {
      if (project.path !== cwd && project.ides?.length) {
        targets.push({
          initData: project,
          scope: 'project',
          settingsPath: null,
          settingsKey: null,
          cwd: project.path,
        });
      }
    }
  }

  return targets;
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
export async function uninstallClaudePlugin(
  scope,
  { exec = runCommand, cwd, variant = VARIANTS.public } = {},
) {
  const scopeFlag = scope === 'project' ? 'project' : 'user';
  const suffix = cwd ? ` (${cwd})` : '';

  const spinner = createSpinner(`Removing Spark plugin from Claude Code${suffix}...`);
  try {
    await exec(
      'claude',
      ['plugin', 'uninstall', variant.claudePlugin, '--scope', scopeFlag],
      cwd ? { cwd } : {},
    );
    spinner.stop(`Spark plugin removed from Claude Code${suffix}`);
  } catch (err) {
    spinner.fail(`Failed to remove Claude Code plugin${suffix}`);
    printWarning(err.stderr?.trim() || err.message);
    printInfo(
      `You can remove it manually: claude plugin uninstall ${variant.claudePlugin} --scope ${scopeFlag}`,
    );
  }
}

/**
 * Uninstall the Codex plugin if it was installed via spark init.
 * Codex plugins are global, so scope is not used.
 */
export async function uninstallCodexPlugin({
  exec = runCommand,
  cwd,
  variant = VARIANTS.public,
} = {}) {
  const suffix = cwd ? ` (${cwd})` : '';

  const spinner = createSpinner(`Removing Spark plugin from Codex${suffix}...`);
  try {
    await exec('codex', ['plugin', 'remove', variant.claudePlugin], cwd ? { cwd } : {});
    spinner.stop(`Spark plugin removed from Codex${suffix}`);
  } catch (err) {
    spinner.fail(`Failed to remove Codex plugin${suffix}`);
    printWarning(err.stderr?.trim() || err.message);
    printInfo(`You can remove it manually: codex plugin remove ${variant.claudePlugin}`);
  }
}

/**
 * Uninstall skills for other IDEs (Cursor, Windsurf, etc.) via skills CLI.
 */
export async function uninstallOtherIDEs(
  scope,
  { spawnInteractive = runInteractiveCommand, cwd, variant = VARIANTS.public } = {},
) {
  const args = ['skills', 'remove', variant.skillsRepo];
  if (scope === 'global') {
    args.push('--global');
  }

  const globalFlag = scope === 'global' ? ' --global' : '';
  const suffix = cwd ? ` (in ${cwd})` : '';
  printInfo(`Running: npx skills remove ${variant.skillsRepo}${globalFlag}${suffix}`);
  console.log('');

  try {
    await spawnInteractive('npx', args, cwd ? { cwd } : {});
    console.log('');
    printInfo('Spark skills removed');
  } catch (err) {
    console.log('');
    printWarning(`Failed to remove skills${suffix}: ${err.message}`);
    printInfo(`You can remove manually: npx skills remove ${variant.skillsRepo}${globalFlag}`);
  }
}

/**
 * Per-IDE uninstall handlers, keyed by canonical IDE key. Each owns its own spinner UX
 * and manual-fallback hints; the table in ides.js drives which keys an init target covers.
 */
const UNINSTALL_BY_KEY = {
  claude: (scope, { exec, cwd, variant }) => uninstallClaudePlugin(scope, { exec, cwd, variant }),
  codex: (scope, { exec, cwd, variant }) => uninstallCodexPlugin({ exec, cwd, variant }),
  other: (scope, { spawnInteractive, cwd, variant }) =>
    uninstallOtherIDEs(scope, { spawnInteractive, cwd, variant }),
};

/**
 * Uninstall IDE plugins/skills for a single init target.
 */
async function uninstallTarget(target, { execAsync, spawnInteractive, writeKey }) {
  const { initData, scope, settingsPath, settingsKey, cwd: targetCwd } = target;

  // Use stored variant when available; fall back to trying both for full cleanup
  const storedVariant = resolveVariant(initData?.variant);
  const variants = storedVariant ? [storedVariant] : [VARIANTS.public, VARIANTS.teams];

  if (targetCwd) {
    printInfo(`Cleaning up project: ${targetCwd}`);
  }

  for (const ide of IDES) {
    if (!initData.ides.includes(ide.key)) continue;
    for (const variant of variants) {
      await UNINSTALL_BY_KEY[ide.key](scope, {
        exec: execAsync,
        spawnInteractive,
        cwd: targetCwd,
        variant,
      });
    }
  }

  if (settingsKey) {
    writeKey(settingsPath, settingsKey, null);
  }
}

/**
 * Uninstall IDE plugins/skills for all init targets (local, global, and registered projects).
 */
async function uninstallAllTargets({ execAsync, spawnInteractive, readKey, writeKey, exists }) {
  const targets = getAllInitTargets(readKey);

  for (const target of targets) {
    if (target.cwd && !exists(target.cwd)) {
      printWarning(`Skipping ${target.cwd} — directory not found`);
      continue;
    }

    await uninstallTarget(target, { execAsync, spawnInteractive, writeKey });
  }

  if (targets.length > 0) {
    writeKey(SETTINGS_PATH, 'projects', null);
    console.log('');
  }
}

/**
 * Uninstall the CLI package itself and clean up .spark directories.
 */
function uninstallCli({ exec, rm }) {
  printInfo('Uninstalling @memco/spark...');

  const spinner = createSpinner('Uninstalling @memco/spark...');

  try {
    exec('npm uninstall -g @memco/spark', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });

    spinner.stop('Successfully uninstalled @memco/spark');

    cleanupSparkDirs(rm);
  } catch (err) {
    spinner.fail('Uninstall failed');

    printNpmError(err, 'uninstall');

    process.exit(1);
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
  exists = existsSync,
} = {}) {
  await uninstallAllTargets({ execAsync, spawnInteractive, readKey, writeKey, exists });
  uninstallCli({ exec, rm });
}
