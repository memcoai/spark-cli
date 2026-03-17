#!/usr/bin/env node

import { program } from 'commander';
import { queryCommand } from '../src/commands/query.js';
import { insightsCommand } from '../src/commands/insights.js';
import { shareCommand } from '../src/commands/share.js';
import { shareTaskCommand } from '../src/commands/share-task.js';
import { feedbackCommand } from '../src/commands/feedback.js';
import { loginCommand, logoutCommand, whoamiCommand } from '../src/commands/auth.js';
import { updateCommand } from '../src/commands/update.js';
import { uninstallCommand } from '../src/commands/uninstall.js';
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
import { VARIANTS, resolveVariant, getVariantKey } from '../src/constants.js';

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

program.hook('postAction', async () => {
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
});

// Query command
program
  .command('query <query>')
  .description('Query the knowledge network for proven solutions and community insights')
  .option(
    '--tag <tag>',
    'Tag describing your context (can be repeated, e.g., --tag language:python:3.11 --tag task_type:bug_fix)',
    (val, prev) => (prev ? [...prev, val] : [val]),
  )
  .option(
    '--xml-tag <tag>',
    'Pre-formed XML tag (can be repeated, e.g., --xml-tag \'<tag type="language" name="python" />\')',
    (val, prev) => (prev ? [...prev, val] : [val]),
  )
  .action(queryCommand);

// Insights command
program
  .command('insights <session-id> <task-index>')
  .description('Get detailed insights for a task from a previous query session')
  .action(insightsCommand);

// Share command
program
  .command('share <session-id>')
  .description('Share an insight or solution with the knowledge network')
  .requiredOption('--title <title>', 'Short title describing the insight')
  .requiredOption('--content <content>', 'The insight content (supports markdown)')
  .requiredOption(
    '--task-index <index>',
    'Task index to attach insight to (use "new" for a new task)',
  )
  .option(
    '--tag <tag>',
    'Tag describing your context (can be repeated, e.g., --tag language:python:3.11 --tag task_type:bug_fix)',
    (val, prev) => (prev ? [...prev, val] : [val]),
  )
  .option(
    '--xml-tag <tag>',
    'Pre-formed XML tag (can be repeated, e.g., --xml-tag \'<tag type="language" name="python" />\')',
    (val, prev) => (prev ? [...prev, val] : [val]),
  )
  .option('--sources <items>', 'Source insight/document IDs from Spark (comma-separated)')
  .action(shareCommand);

// Share-task command
program
  .command('share-task <query>')
  .description('Share task insights with the knowledge network')
  .requiredOption('--insight <insight>', 'Insight to share (can be repeated)', (val, prev) =>
    prev ? [...prev, val] : [val],
  )
  .option(
    '--tag <tag>',
    'Tag describing your context (can be repeated, e.g., --tag language:python:3.11 --tag task_type:bug_fix)',
    (val, prev) => (prev ? [...prev, val] : [val]),
  )
  .option(
    '--xml-tag <tag>',
    'Pre-formed XML tag (can be repeated, e.g., --xml-tag \'<tag type="language" name="python" />\')',
    (val, prev) => (prev ? [...prev, val] : [val]),
  )
  .action(shareTaskCommand);

// Feedback command
program
  .command('feedback <session-id>')
  .description('Provide feedback on recommendations from a previous query session')
  .option('--helpful', 'Mark recommendations as helpful')
  .option('--not-helpful', 'Mark recommendations as not helpful')
  .action(feedbackCommand);

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
  .action(updateCommand);

program
  .command('uninstall')
  .description('Uninstall Spark CLI from this system')
  .action(uninstallCommand);

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

program.parse();
