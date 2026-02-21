import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  printMemcoLogo,
  printError,
  printInfo,
  printWarning,
  createSpinner,
  colorize,
} from '../banner.js';
import { readSettingsKey, writeSettingsKey } from '../settings.js';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH } from '../constants.js';
import { fetchSkillsVersion } from '../update-check.js';

/**
 * Prompt a multi-select checklist. Users toggle with space, navigate with arrows, confirm with enter.
 * Returns array of selected option labels.
 */
export function promptChecklist(question, options) {
  return new Promise((resolve, reject) => {
    const selected = new Array(options.length).fill(false);
    let cursor = 0;

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
    render();

    if (!process.stdin.isTTY) {
      reject(new Error('Interactive prompts require a TTY terminal'));
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (key) => {
      // Ctrl-C
      if (key === '\x03') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        reject(new Error('User cancelled'));
        return;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
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
    };

    process.stdin.on('data', onData);
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

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(colorize('\x1b[2m', 'Enter choice: '), (answer) => {
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
 * Set up Claude Code with Spark plugin.
 */
async function setupClaudeCode(scope, { exec = runCommand } = {}) {
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
 * Run a command interactively with stdio inherited. Returns a promise that
 * resolves on exit code 0, rejects otherwise.
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
 * Set up other IDEs (Cursor, Windsurf, etc.) via skills CLI.
 */
async function setupOtherIDEs(scope, { spawnInteractive = runInteractiveCommand } = {}) {
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
const IDE_KEY_MAP = {
  'Claude Code': 'claude',
  'Other (Cursor, Windsurf, etc.)': 'other',
};

/**
 * Save init choices to settings.
 * Project scope: writes to local + upserts in global projects array.
 * Global scope: writes to globalInit in global settings.
 */
async function saveInitChoices(ides, scope, { fetchVersion = fetchSkillsVersion } = {}) {
  const ideKeys = ides.map((ide) => IDE_KEY_MAP[ide] || ide);

  // Fetch the current skills version to record what was installed
  const versionInfo = await fetchVersion();
  const skillsVersion = versionInfo?.version || null;

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
function printAuthInstructions() {
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
 * Core init logic, accepts dependencies for testability.
 */
export async function runInit({
  prompt_checklist = promptChecklist,
  prompt_choice = promptChoice,
  exec = runCommand,
  spawn_interactive = runInteractiveCommand,
  fetch_version = fetchSkillsVersion,
} = {}) {
  printMemcoLogo();

  // Step 1: IDE selection
  let selectedIDEs;
  try {
    selectedIDEs = await prompt_checklist('Select your IDE(s):', [
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

  // Step 2: Scope selection
  let scopeChoice;
  try {
    scopeChoice = await prompt_choice('Install scope:', [
      'This project (current directory)',
      'Global (all projects)',
    ]);
  } catch (err) {
    if (err.message === 'User cancelled') {
      console.log('');
      printInfo('Setup cancelled.');
      return;
    }
    throw err;
  }

  const scope = scopeChoice.startsWith('Global') ? 'global' : 'project';
  console.log('');

  // Step 3: Execute setup
  for (const ide of selectedIDEs) {
    if (ide === 'Claude Code') {
      await setupClaudeCode(scope, { exec });
    } else {
      await setupOtherIDEs(scope, { spawnInteractive: spawn_interactive });
    }
  }

  // Step 4: Save init choices
  try {
    await saveInitChoices(selectedIDEs, scope, { fetchVersion: fetch_version });
  } catch {
    // Non-blocking — don't fail init if we can't save preferences
  }

  // Step 5: Auth instructions
  printAuthInstructions();
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
