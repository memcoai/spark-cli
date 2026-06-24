#!/usr/bin/env node

import { program } from 'commander';
import { loginCommand, logoutCommand, whoamiCommand } from '../src/commands/auth.js';
import { runUpdate } from '../src/commands/update.js';
import { runUninstall } from '../src/commands/uninstall.js';
import { initCommand } from '../src/commands/init.js';
import { enableCommand } from '../src/commands/enable.js';
import { disableCommand } from '../src/commands/disable.js';
import { statusCommand } from '../src/commands/status.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  checkForUpdate,
  getVersionNotification,
  getCachedVersion,
  getLocalVersion,
  checkCompatibility,
  getCachedCompatibility,
  evaluateCompatibility,
  checkSkillsVersion,
  getCachedSkillsVersion,
  getSkillsNotification,
  getInitData,
} from '../src/update-check.js';
import { setVersionNotification, printVersionNotification } from '../src/output.js';
import { VARIANTS, resolveVariant, getVariantKey, getApiBase } from '../src/constants.js';
import { getManifestForRegistration, checkToolManifest } from '../src/tool-manifest.js';
import { registerToolCommands } from '../src/tool-commands.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

let updateCheckPromise = null;
let compatCheckPromise = null;
let skillsCheckPromise = null;

program
  .name('spark')
  .description('Collective knowledge network for AI coding agents')
  .version(pkg.version)
  .option('--api-key <key>', 'API key for authentication (overrides SPARK_API_KEY)')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--no-color', 'Disable colored output');

program.hook('preAction', (thisCommand, actionCommand) => {
  if (program.opts().color === false) {
    process.env.NO_COLOR = '1';
  }

  // Skip version/compatibility checks for the update command
  if (['update', 'uninstall', 'init', 'enable', 'disable'].includes(actionCommand.name())) return;

  const localVersion = getLocalVersion();

  // Check cached compatibility data synchronously (no network delay)
  const cachedCompat = getCachedCompatibility();
  if (cachedCompat?.data) {
    const evaluation = evaluateCompatibility(localVersion, cachedCompat.data);

    if (evaluation.blocked) {
      process.stderr.write('\n' + evaluation.messages.join('\n') + '\n');
      process.exit(1);
    }

    if (evaluation.deprecation) {
      setVersionNotification(evaluation.messages.join('\n'));
    }
  }

  // Pre-set update notification from cached npm data
  const cachedVersion = getCachedVersion();
  if (cachedVersion) {
    const notification = getVersionNotification(cachedVersion);
    if (notification) {
      setVersionNotification(notification.message);
    }
  }

  // Pre-set skills update notification from cached data
  const cachedSkills = getCachedSkillsVersion();
  const initData = getInitData();
  if (cachedSkills && initData) {
    const initVariant = resolveVariant(initData?.variant) || VARIANTS.public;
    const skillsNotification = getSkillsNotification(cachedSkills, initData, initVariant);
    if (skillsNotification) {
      setVersionNotification(skillsNotification.message);
    }
  }

  // Start background checks
  compatCheckPromise = checkCompatibility().then((result) => {
    if (result?.data) {
      const evaluation = evaluateCompatibility(localVersion, result.data);
      if (!evaluation.blocked && evaluation.deprecation) {
        setVersionNotification(evaluation.messages.join('\n'));
      }
    }
  });

  updateCheckPromise = checkForUpdate().then((latestInfo) => {
    if (latestInfo) {
      const notification = getVersionNotification(latestInfo);
      if (notification) {
        setVersionNotification(notification.message);
      }
    }
  });

  const bgInitData = getInitData();
  const bgVariant = resolveVariant(bgInitData?.variant) || VARIANTS.public;
  skillsCheckPromise = checkSkillsVersion(getVariantKey(bgVariant)).then((latestSkills) => {
    if (latestSkills) {
      const currentInitData = getInitData();
      if (currentInitData) {
        const currentVariant = resolveVariant(currentInitData?.variant) || VARIANTS.public;
        const skillsNotification = getSkillsNotification(
          latestSkills,
          currentInitData,
          currentVariant,
        );
        if (skillsNotification) {
          setVersionNotification(skillsNotification.message);
        }
      }
    }
  });
});

program.hook('postAction', async (thisCommand, actionCommand) => {
  if (compatCheckPromise) {
    await compatCheckPromise;
  }
  if (updateCheckPromise) {
    await updateCheckPromise;
  }
  if (skillsCheckPromise) {
    await skillsCheckPromise;
  }
  printVersionNotification();

  // Refresh the manifest cache only after a DYNAMIC tool command, and only when
  // the TTL has lapsed: checkToolManifest is a no-op cache read when fresh (no
  // network). Fail-open. Lifecycle commands and offline `--help`/`--version`
  // (no action → no postAction hook) never trigger an MCP connect.
  if (actionCommand && !STATIC_COMMAND_NAMES.has(actionCommand.name())) {
    await checkToolManifest(getApiBase()).catch(() => null);
  }
});

// Auth commands
program
  .command('login')
  .description('Authenticate with Spark (opens browser)')
  .option('--local', 'Store credentials in current directory (.spark/)')
  .option('--api-base <url>', 'Set the API base URL')
  .action(loginCommand);

program.command('logout').description('Remove stored credentials').action(logoutCommand);

program.command('whoami').description('Show current authenticated user').action(whoamiCommand);

program
  .command('update')
  .description('Update Spark CLI to the latest version')
  .action(() => runUpdate());

program
  .command('uninstall')
  .description('Uninstall Spark CLI from this system')
  .action(() => runUninstall());

program.command('init').description('Set up Spark for your IDE').action(initCommand);

program.command('enable').description('Enable Spark for the current project').action(enableCommand);

program
  .command('disable')
  .description('Disable Spark for the current project')
  .action(disableCommand);

program
  .command('status')
  .description('Verify Spark setup and authentication')
  .action(statusCommand);

// Snapshot the static (lifecycle) command names BEFORE registering dynamic tool
// commands so the postAction hook can distinguish lifecycle commands from dynamic
// tool commands. STATIC_COMMAND_NAMES is declared after the hook, but the hook only
// runs during program.parse() (after this declaration executes), so the closure
// reference is safe — keep program.parse() last.
const STATIC_COMMAND_NAMES = new Set(program.commands.map((c) => c.name()));

// Dynamic tool commands derived from the cached MCP tool manifest (offline, no network).
// Empty/foreign cache => no dynamic commands are registered (a login hint is shown instead).
registerToolCommands(program, getManifestForRegistration(getApiBase()));

program.parse();
