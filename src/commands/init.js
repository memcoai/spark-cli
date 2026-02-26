import { createInterface } from 'node:readline';
import {
  printBanner,
  printError,
  printInfo,
  printWarning,
  createSpinner,
  colorize,
} from '../banner.js';
import { readSettingsKey, writeSettingsKey } from '../settings.js';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH } from '../constants.js';
import { fetchSkillsVersion } from '../update-check.js';
import { runCommand, runInteractiveCommand } from '../exec.js';

/**
 * Prompt a multi-select checklist. Users toggle with space, navigate with arrows, confirm with enter.
 * Returns array of selected option labels.
 */
export function promptChecklist(question, options) {
  return new Promise((resolve, reject) => {
    const selected = new Array(options.length).fill(false);
    let cursor = 0;
    let cleanedUp = false;

    const render = () => {
      // Move cursor up to overwrite previous render (except first render)
      if (render.rendered) {
        process.stdout.write(`\x1b[${options.length}A`);
      }
      for (let i = 0; i < options.length; i++) {
        const check = selected[i] ? 'x' : ' ';
        const prefix = i === cursor ? colorize('\x1b[32m', '❯') : ' ';
        const label = i === cursor ? colorize('\x1b[1m', options[i]) : options[i];
        process.stdout.write(`\r\x1b[K${prefix} [${check}] ${label}\n`);
      }
      render.rendered = true;
    };

    console.log(colorize('\x1b[1m', question));
    console.log(colorize('\x1b[2m', '(↑/↓ navigate, space toggle, enter confirm)'));

    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      render();
      reject(
        new Error(
          'Interactive terminal (TTY) is required to use checklist prompts. Please run this command directly in a terminal.',
        ),
      );
      return;
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        process.stdin.removeListener('data', onData);
      } catch {
        // ignore errors
      }
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
        try {
          process.stdin.setRawMode(false);
        } catch {
          // ignore errors
        }
      }
      try {
        process.stdin.pause();
      } catch {
        // ignore errors
      }
    };

    const onData = (key) => {
      try {
        // Ctrl-C
        if (key === '\x03') {
          cleanup();
          reject(new Error('User cancelled'));
          return;
        }

        // Enter
        if (key === '\r' || key === '\n') {
          cleanup();
          const result = options.filter((_, i) => selected[i]);
          resolve(result);
          return;
        }

        // Space — toggle
        if (key === ' ') {
          selected[cursor] = !selected[cursor];
          render();
          return;
        }

        // Arrow keys (escape sequences)
        if (key === '\x1b[A' || key === 'k') {
          cursor = (cursor - 1 + options.length) % options.length;
          render();
          return;
        }
        if (key === '\x1b[B' || key === 'j') {
          cursor = (cursor + 1) % options.length;
          render();
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    process.stdin.on('data', onData);
    render();
  });
}

/**
 * Prompt a single-select numbered choice. Returns the selected option label.
 */
export function promptChoice(question, options) {
  return new Promise((resolve, reject) => {
    console.log(colorize('\x1b[1m', question));
    for (let i = 0; i < options.length; i++) {
      const number = colorize('\x1b[32m', '[' + (i + 1) + ']');
      console.log(`  ${number} ${options[i]}`);
    }

    let answered = false;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => {
      if (!answered) {
        reject(new Error('User cancelled'));
      }
    });
    rl.question(colorize('\x1b[2m', 'Enter choice: '), (answer) => {
      answered = true;
      rl.close();
      const idx = Number.parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        resolve(options[idx]);
      } else {
        reject(new Error(`Invalid choice: ${answer}`));
      }
    });
  });
}

/**
 * Set up Claude Code with Spark plugin.
 */
export async function setupClaudeCode(scope, { exec = runCommand } = {}) {
  const scopeFlag = scope === 'project' ? 'project' : 'user';

  const addSpinner = createSpinner('Adding Spark marketplace...');
  try {
    await exec('claude', ['plugin', 'marketplace', 'add', 'memcoai/marketplace']);
    addSpinner.stop('Spark marketplace added');
  } catch (err) {
    const msg = (err.stderr?.trim() || err.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('exists')) {
      addSpinner.stop('Spark marketplace already configured');
    } else {
      addSpinner.fail('Failed to add marketplace');
      printWarning(err.stderr?.trim() || err.message);
      printInfo('You can add it manually: claude plugin marketplace add memcoai/marketplace');
    }
  }

  const installSpinner = createSpinner('Installing Spark plugin...');
  try {
    await exec('claude', ['plugin', 'install', 'spark-cli@MemCo', '--scope', scopeFlag]);
    installSpinner.stop(`Spark plugin installed (${scopeFlag} scope)`);
  } catch (err) {
    installSpinner.fail('Failed to install plugin');
    printWarning(err.stderr?.trim() || err.message);
    printInfo(
      `You can install it manually: claude plugin install spark-cli@MemCo --scope ${scopeFlag}`,
    );
  }
}

/**
 * Set up other IDEs (Cursor, Windsurf, etc.) via skills CLI.
 */
export async function setupOtherIDEs(scope, { spawnInteractive = runInteractiveCommand } = {}) {
  const args = ['skills', 'add', 'memcoai/spark-cli-skills'];
  if (scope === 'global') {
    args.push('--global');
  }

  const globalFlag = scope === 'global' ? ' --global' : '';
  printInfo(`Running: npx skills add memcoai/spark-cli-skills${globalFlag}`);
  console.log('');

  try {
    await spawnInteractive('npx', args);
    console.log('');
    printInfo(`Spark skills installed (${scope} scope)`);
  } catch (err) {
    console.log('');
    printWarning(`Failed to install skills: ${err.message}`);
    printInfo(`You can install manually: npx skills add memcoai/spark-cli-skills${globalFlag}`);
  }
}

/**
 * Map IDE selection labels to short keys.
 */
export const IDE_KEY_MAP = {
  'Claude Code': 'claude',
  'Other (Cursor, Windsurf, etc.)': 'other',
};

/**
 * Save init choices to settings.
 * Project scope: writes to local + upserts in global projects array.
 * Global scope: writes to globalInit in global settings.
 */
export async function saveInitChoices(ides, scope, { fetchVersion = fetchSkillsVersion } = {}) {
  const ideKeys = ides.map((ide) => IDE_KEY_MAP[ide] || ide);

  // Fetch the current skills version to record what was installed
  const versionInfo = await fetchVersion();
  const skillsVersion = versionInfo?.version || '0.0.0';

  const initData = { ides: ideKeys, skillsVersion };

  if (scope === 'global') {
    writeSettingsKey(SETTINGS_PATH, 'globalInit', initData);
  } else {
    // Write to local settings
    writeSettingsKey(LOCAL_SETTINGS_PATH, 'init', initData);

    // Upsert in global projects array
    const projects = readSettingsKey(SETTINGS_PATH, 'projects') || [];
    const cwd = process.cwd();
    const idx = projects.findIndex((p) => p.path === cwd);
    const entry = { path: cwd, ...initData };
    if (idx >= 0) {
      projects[idx] = entry;
    } else {
      projects.push(entry);
    }
    writeSettingsKey(SETTINGS_PATH, 'projects', projects);
  }
}

/**
 * Print auth instructions after IDE setup.
 */
export function printAuthInstructions() {
  console.log('');
  console.log(colorize('\x1b[1m', 'Next: Authenticate with Spark'));
  console.log('');
  console.log(
    `  ${colorize('\x1b[33m', 'Option 1:')} Run ${colorize('\x1b[32m', 'spark login')} (opens browser)`,
  );
  console.log('');
  console.log(
    `  ${colorize('\x1b[33m', 'Option 2:')} Visit ${colorize('\x1b[32m', 'https://spark.memco.ai')}, log in, create an API key,`,
  );
  console.log(`             then set: ${colorize('\x1b[32m', 'export SPARK_API_KEY=your_key')}`);
  console.log('');
  console.log(
    `Once authenticated, run ${colorize('\x1b[32m', 'spark status')} to verify your setup.`,
  );
}

/**
 * Run a prompt function, handling user cancellation gracefully.
 * Returns the prompt result, or undefined if the user cancelled.
 */
async function promptWithCancel(promptFn, ...args) {
  try {
    return await promptFn(...args);
  } catch (err) {
    if (err.message === 'User cancelled') {
      console.log('');
      printInfo('Setup cancelled.');
      return undefined;
    }
    throw err;
  }
}

/**
 * Execute IDE setup for the given selections.
 */
async function executeSetup(selectedIDEs, scope, { exec, spawnInteractive }) {
  for (const ide of selectedIDEs) {
    if (ide === 'Claude Code') {
      await setupClaudeCode(scope, { exec });
    } else {
      await setupOtherIDEs(scope, { spawnInteractive });
    }
  }
}

/**
 * Shared setup flow used by both `init` and `enable`.
 * When `scope` is provided, the scope prompt is skipped.
 */
export async function runSetupFlow({
  scope: fixedScope,
  promptChecklist: promptChecklistFn = promptChecklist,
  promptChoice: promptChoiceFn = promptChoice,
  exec = runCommand,
  spawnInteractive = runInteractiveCommand,
  fetchVersion = fetchSkillsVersion,
} = {}) {
  printBanner();

  // Step 1: IDE selection
  const selectedIDEs = await promptWithCancel(promptChecklistFn, 'Select your IDE(s):', [
    'Claude Code',
    'Other (Cursor, Windsurf, etc.)',
  ]);
  if (!selectedIDEs) return;

  if (selectedIDEs.length === 0) {
    console.log('');
    printWarning('No IDE selected. Please select at least one IDE.');
    return;
  }

  console.log('');

  // Step 2: Scope selection (skipped when scope is pre-determined)
  let scope = fixedScope;
  if (!scope) {
    const scopeChoice = await promptWithCancel(promptChoiceFn, 'Install scope:', [
      'This project (current directory)',
      'Global (all projects)',
    ]);
    if (!scopeChoice) return;

    scope = scopeChoice.startsWith('Global') ? 'global' : 'project';
    console.log('');
  }

  // Step 3: Execute setup
  await executeSetup(selectedIDEs, scope, { exec, spawnInteractive });

  // Step 4: Save init choices
  try {
    await saveInitChoices(selectedIDEs, scope, { fetchVersion });
  } catch {
    // Non-blocking — don't fail if we can't save preferences
  }

  // Step 5: Auth instructions
  printAuthInstructions();
}

/**
 * Core init logic, accepts dependencies for testability.
 */
export async function runInit(deps = {}) {
  return runSetupFlow(deps);
}

/**
 * spark init — set up Spark for your IDE.
 */
export async function initCommand() {
  try {
    await runInit();
  } catch (err) {
    printError(err.message);
    process.exit(1);
  }
}
