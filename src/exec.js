import { execFile, spawn } from 'node:child_process';
import { printError } from './banner.js';

/**
 * Print a user-facing error for a failed npm child-process invocation.
 * `cmd` is the spark subcommand name used in the sudo hint (e.g. 'update', 'uninstall').
 */
export function printNpmError(err, cmd) {
  if (err.code === 'ENOENT') {
    printError('npm is not installed or not in PATH');
  } else if (err.code === 'EACCES') {
    printError(`Permission denied. Try running with sudo: sudo spark ${cmd}`);
  } else if (err.stderr?.trim()) {
    printError(err.stderr.trim());
  } else {
    printError(err.message);
  }
}

/**
 * Run a command via execFile. Returns a promise with { stdout, stderr }.
 */
export function runCommand(cmd, args, options = {}) {
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
 * Run a command interactively with stdio inherited. Returns a promise that
 * resolves on exit code 0, rejects otherwise.
 */
export function runInteractiveCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
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
