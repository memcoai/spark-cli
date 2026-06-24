import { printBanner, printError, printInfo, printSuccess } from '../banner.js';
import { readSettingsKey, writeSettingsKey } from '../settings.js';
import { LOCAL_SETTINGS_PATH, resolveVariant } from '../constants.js';
import { runCommand, runInteractiveCommand } from '../exec.js';
import { uninstallClaudePlugin, uninstallOtherIDEs, removeInitData } from './uninstall.js';
import { detectVariant } from '../variant.js';
import { IDES } from '../ides.js';

/**
 * Per-IDE project-scoped teardown handlers used by `spark disable`. Global-only IDEs
 * (Codex) are intentionally absent — they are shared across projects and removed only by
 * `spark uninstall`, so a project-scoped disable must never tear them down.
 */
const DISABLE_BY_KEY = {
  claude: ({ execAsync, variant }) =>
    uninstallClaudePlugin('project', { exec: execAsync, variant }),
  other: ({ spawnInteractive, variant }) =>
    uninstallOtherIDEs('project', { spawnInteractive, variant }),
};

/**
 * Core disable logic — removes Spark from the current project.
 * Reverse of `spark enable`: removes IDE plugins/skills and cleans up init data.
 */
export async function runDisable({
  execAsync = runCommand,
  spawnInteractive = runInteractiveCommand,
  readKey = readSettingsKey,
  writeKey = writeSettingsKey,
  detect = detectVariant,
} = {}) {
  printBanner();

  const initData = readKey(LOCAL_SETTINGS_PATH, 'init');
  if (!initData?.ides?.length) {
    printInfo('Spark is not enabled for this project.');
    return;
  }

  let variant = resolveVariant(initData?.variant);

  if (!variant) {
    try {
      variant = await detect();
    } catch {
      printError('Could not detect variant: not authenticated or API unavailable.');
      process.exit(1);
      return;
    }
  }

  // Codex is global-only (tracked in globalInit, never in per-project init), so a project-scoped
  // disable never removes it — it is shared across projects and removed only by `spark uninstall`.
  // The table drives the iteration; global-only descriptors have no DISABLE_BY_KEY handler.
  for (const ide of IDES) {
    if (ide.globalOnly) continue;
    if (!initData.ides.includes(ide.key)) continue;
    await DISABLE_BY_KEY[ide.key]({ execAsync, spawnInteractive, variant });
  }

  removeInitData(LOCAL_SETTINGS_PATH, 'init', { readKey, writeKey });

  console.log('');
  printSuccess('Spark has been disabled for this project.');
}

/**
 * spark disable — disable Spark for the current project.
 */
export async function disableCommand() {
  try {
    await runDisable();
  } catch (err) {
    printError(err.message);
    process.exit(1);
  }
}
