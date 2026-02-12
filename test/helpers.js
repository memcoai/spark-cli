import { mock, beforeEach, afterEach } from 'node:test';

/**
 * Sets up console.log and process.exit mocks for command tests.
 * Must be called inside a describe() block.
 * Returns an object whose logMock/exitMock properties update each beforeEach.
 */
export function setupCommandMocks() {
  const mocks = {};

  beforeEach(() => {
    mocks.logMock = mock.method(console, 'log');
    mocks.exitMock = mock.method(process, 'exit', () => {});
  });

  afterEach(() => {
    mocks.logMock.mock.restore();
    mocks.exitMock.mock.restore();
  });

  return mocks;
}

export function getErrorOutput(logMock) {
  return JSON.parse(logMock.mock.calls[0].arguments[0]);
}
