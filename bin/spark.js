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
  .description('Query for solutions to a problem')
  .option('-e, --env <items>', 'Environment tags (comma-separated, e.g., node:20,react:18)')
  .option('-t, --tags <items>', 'Task tags (comma-separated, e.g., typescript,nextjs)')
  .action(queryCommand);

// Insights command
program
  .command('insights <session-id> <task-index>')
  .description('Get detailed insights for a specific recommendation')
  .action(insightsCommand);

// Share command
program
  .command('share')
  .description('Share a solution you discovered')
  .requiredOption('--title <title>', 'Title of the insight')
  .requiredOption('--content <content>', 'Content/description of the solution')
  .option('--session <id>', 'Session ID from a previous query')
  .option('--task-index <index>', 'Task index from the session')
  .option('-e, --env <items>', 'Environment tags (comma-separated)')
  .option('-t, --tags <items>', 'Task tags (comma-separated)')
  .option('--sources <urls>', 'Source URLs (comma-separated)')
  .action(shareCommand);

// Feedback command
program
  .command('feedback <session-id>')
  .description('Provide feedback on recommendations')
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
