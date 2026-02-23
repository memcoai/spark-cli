import { mock, beforeEach, afterEach } from 'node:test';

/**
 * Sets up console.log, process.exit, and process.stdout.write mocks for command tests.
 * Must be called inside a describe() block.
 * Returns an object whose logMock/exitMock/stdoutMock properties update each beforeEach.
 */
export function setupCommandMocks() {
  const mocks = {};

  beforeEach(() => {
    mocks.logMock = mock.method(console, 'log');
    mocks.exitMock = mock.method(process, 'exit', () => {});
    mocks.stdoutMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    mocks.logMock.mock.restore();
    mocks.exitMock.mock.restore();
    mocks.stdoutMock.mock.restore();
  });

  return mocks;
}

export function getErrorOutput(logMock) {
  return JSON.parse(logMock.mock.calls[0].arguments[0]);
}

export function getLogOutput(m) {
  return m.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
}

export function getStdoutOutput(m) {
  return m.mock.calls.map((c) => c.arguments[0]).join('');
}

/**
 * Shared npm exec error cases for update/uninstall command tests.
 * Each entry has a name, error object, and expected output substring.
 */
export const npmExecErrorCases = [
  {
    name: 'shows npm-not-found message on ENOENT',
    error: Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' }),
    expected: 'npm is not installed or not in PATH',
  },
  {
    name: 'shows permission message on EACCES',
    error: Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    expected: 'Permission denied',
  },
  {
    name: 'prints stderr message on npm failure',
    error: Object.assign(new Error('command failed'), { stderr: '  npm ERR! network error  ' }),
    expected: 'npm ERR! network error',
  },
  {
    name: 'falls back to error message when stderr is empty',
    error: Object.assign(new Error('ETIMEOUT'), { stderr: '' }),
    expected: 'ETIMEOUT',
  },
];
