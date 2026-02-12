import { prettyPrint } from './pretty-print.js';
import { printSuccess, printError } from './banner.js';

let pendingVersionNotification = null;

/**
 * Set the version notification to display after output.
 */
export function setVersionNotification(notification) {
  pendingVersionNotification = notification;
}

/**
 * Print the pending version notification to stderr, then clear it.
 */
export function printVersionNotification() {
  if (pendingVersionNotification) {
    process.stderr.write('\n' + pendingVersionNotification + '\n');
    pendingVersionNotification = null;
  }
}

/**
 * Get parent command options (walks up the commander chain)
 */
export function getParentOptions(command) {
  let current = command;
  while (current?.parent) {
    current = current.parent;
  }
  return current?.opts() || {};
}

/**
 * Output data.
 * Uses --pretty flag from parent command for formatting.
 * Pretty mode renders human-readable output with markdown formatting.
 * Default mode outputs compact JSON.
 */
export function output(data, command = null) {
  const opts = getParentOptions(command);
  const pretty = opts.pretty || false;

  if (pretty) {
    console.log(prettyPrint(data));
  } else {
    console.log(JSON.stringify(data));
  }
}

/**
 * Output an error.
 * Pretty mode uses styled terminal output; default mode outputs JSON.
 */
export function outputError(error, command = null) {
  const opts = getParentOptions(command);
  const pretty = opts.pretty || false;

  if (pretty) {
    printError(error.message || String(error));
  } else {
    output({ error: true, message: error.message || String(error) }, command);
  }
  printVersionNotification();
  process.exit(1);
}

/**
 * Output a success message.
 * Pretty mode uses styled terminal output; default mode outputs JSON.
 */
export function outputSuccess(message, data = {}, command = null) {
  const opts = getParentOptions(command);
  const pretty = opts.pretty || false;

  if (pretty) {
    printSuccess(message);
    if (Object.keys(data).length > 0) {
      console.log(prettyPrint(data));
    }
  } else {
    output({ success: true, message, ...data }, command);
  }
}
