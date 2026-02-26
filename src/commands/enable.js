import { printBanner, printError, printInfo, printWarning } from '../banner.js';
import { runCommand, runInteractiveCommand } from '../exec.js';
import { fetchSkillsVersion } from '../update-check.js';
import {
  promptChecklist,
  setupClaudeCode,
  setupOtherIDEs,
  saveInitChoices,
  printAuthInstructions,
} from './init.js';

/**
 * Core enable logic — sets up Spark for the current project.
 * Unlike init, always uses project scope (no scope prompt).
 */
export async function runEnable({
  promptChecklist: promptChecklistFn = promptChecklist,
  exec = runCommand,
  spawnInteractive = runInteractiveCommand,
  fetchVersion = fetchSkillsVersion,
} = {}) {
  printBanner();

  // Step 1: IDE selection
  let selectedIDEs;
  try {
    selectedIDEs = await promptChecklistFn('Select your IDE(s):', [
      'Claude Code',
      'Other (Cursor, Windsurf, etc.)',
    ]);
  } catch (err) {
    if (err.message === 'User cancelled') {
      console.log('');
      printInfo('Setup cancelled.');
      return;
    }
    throw err;
  }

  if (selectedIDEs.length === 0) {
    console.log('');
    printWarning('No IDE selected. Please select at least one IDE.');
    return;
  }

  console.log('');

  // Step 2: Execute setup (always project scope)
  const scope = 'project';
  for (const ide of selectedIDEs) {
    if (ide === 'Claude Code') {
      await setupClaudeCode(scope, { exec });
    } else {
      await setupOtherIDEs(scope, { spawnInteractive });
    }
  }

  // Step 3: Save init choices
  try {
    await saveInitChoices(selectedIDEs, scope, { fetchVersion });
  } catch {
    // Non-blocking — don't fail enable if we can't save preferences
  }

  // Step 4: Auth instructions
  printAuthInstructions();
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
