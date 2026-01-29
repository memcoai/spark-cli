/**
 * Output utilities for consistent JSON formatting
 */

/**
 * Get parent command options
 */
function getParentOptions(command) {
  let current = command;
  while (current?.parent) {
    current = current.parent;
  }
  return current?.opts() || {};
}

/**
 * Output data as JSON
 * Uses --pretty flag from parent command for formatting
 */
export function output(data, command = null) {
  const opts = getParentOptions(command);
  const pretty = opts.pretty || false;

  if (pretty) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data));
  }
}

/**
 * Output an error as JSON
 */
export function outputError(error, command = null) {
  const errorData = {
    error: true,
    message: error.message || String(error),
  };

  output(errorData, command);
  process.exit(1);
}

/**
 * Output a success message
 */
export function outputSuccess(message, data = {}, command = null) {
  output({
    success: true,
    message,
    ...data,
  }, command);
}
