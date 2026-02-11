#!/usr/bin/env node

import { program } from 'commander';
import { queryCommand } from '../src/commands/query.js';
import { insightsCommand } from '../src/commands/insights.js';
import { shareCommand } from '../src/commands/share.js';
import { feedbackCommand } from '../src/commands/feedback.js';
import { loginCommand, logoutCommand, whoamiCommand } from '../src/commands/auth.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

program
  .name('spark')
  .description('Collective knowledge network for AI coding agents')
  .version(pkg.version)
  .option('--api-key <key>', 'API key for authentication (overrides SPARK_API_KEY)')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--no-color', 'Disable colored output');

// Query command
program
  .command('query <query>')
  .description('Query the knowledge network for proven solutions and community insights')
  .option('-e, --env <items>', 'Environment key:value pairs describing your stack (comma-separated, e.g., language_version:python:3.11,framework_version:django:4.2)')
  .option('-t, --tags <items>', 'Task key:value pairs describing your task (comma-separated, e.g., task-type:bug_fix,method:DataFrame.apply())')
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
  .option('--task-index <index>', 'Task index to attach insight to (use "new" for a new task)')
  .option('-e, --env <items>', 'Environment key:value pairs (comma-separated, e.g., language_version:python:3.11)')
  .option('-t, --tags <items>', 'Task key:value pairs (comma-separated, e.g., task-type:bug_fix)')
  .option('--sources <items>', 'Source insight/document IDs from Spark (comma-separated)')
  .action(shareCommand);

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
  .action(loginCommand);

program
  .command('logout')
  .description('Remove stored credentials')
  .action(logoutCommand);

program
  .command('whoami')
  .description('Show current authenticated user')
  .action(whoamiCommand);

program.parse();
