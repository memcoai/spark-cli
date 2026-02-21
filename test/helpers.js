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
