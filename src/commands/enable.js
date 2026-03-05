import { printError } from '../banner.js';
import { runSetupFlow } from './init.js';

/**
 * Core enable logic — sets up Spark for the current project.
 * Unlike init, always uses project scope (no scope prompt).
 */
export async function runEnable({
  promptChecklist,
  exec,
  spawnInteractive,
  fetchVersion,
  writeKey,
  readKey,
} = {}) {
  return runSetupFlow({
    scope: 'project',
    promptChecklist,
    exec,
    spawnInteractive,
    fetchVersion,
    writeKey,
    readKey,
  });
}

/**
 * spark enable — enable Spark for the current project.
 */
export async function enableCommand() {
  try {
    await runEnable();
  } catch (err) {
    printError(err.message);
    process.exit(1);
  }
}
