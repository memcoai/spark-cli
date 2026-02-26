import { printBanner, printError, printInfo, printSuccess } from '../banner.js';
import { readSettingsKey, writeSettingsKey } from '../settings.js';
import { LOCAL_SETTINGS_PATH } from '../constants.js';
import { runCommand, runInteractiveCommand } from '../exec.js';
import { uninstallClaudePlugin, uninstallOtherIDEs, removeInitData } from './uninstall.js';

/**
 * Core disable logic — removes Spark from the current project.
 * Reverse of `spark enable`: removes IDE plugins/skills and cleans up init data.
 */
export async function runDisable({
  execAsync = runCommand,
  spawnInteractive = runInteractiveCommand,
  readKey = readSettingsKey,
  writeKey = writeSettingsKey,
} = {}) {
  printBanner();

  const initData = readKey(LOCAL_SETTINGS_PATH, 'init');
  if (!initData?.ides?.length) {
    printInfo('Spark is not enabled for this project.');
    return;
  }

  const scope = 'project';

  if (initData.ides.includes('claude')) {
    await uninstallClaudePlugin(scope, { exec: execAsync });
  }

  if (initData.ides.includes('other')) {
    await uninstallOtherIDEs(scope, { spawnInteractive });
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
