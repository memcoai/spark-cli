import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { insightsCommand } from '../../src/commands/insights.js';

describe('insightsCommand', () => {
  let logMock;
  let exitMock;

  beforeEach(() => {
    logMock = mock.method(console, 'log');
    exitMock = mock.method(process, 'exit', () => {});
  });

  afterEach(() => {
    logMock.mock.restore();
    exitMock.mock.restore();
  });

  function getErrorOutput() {
    return JSON.parse(logMock.mock.calls[0].arguments[0]);
  }

  it('errors on non-numeric task index', async () => {
    await insightsCommand('session-1', 'abc', {}, null);

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = getErrorOutput();
    assert.strictEqual(output.error, true);
    assert.match(output.message, /task-index must be a non-negative integer/);
  });

  it('errors on negative task index', async () => {
    await insightsCommand('session-1', '-1', {}, null);

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = getErrorOutput();
    assert.match(output.message, /task-index must be a non-negative integer/);
  });

  it('errors on float task index', async () => {
    await insightsCommand('session-1', '3.14', {}, null);

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = getErrorOutput();
    assert.match(output.message, /task-index must be a non-negative integer/);
  });

  it('errors on empty string task index', async () => {
    await insightsCommand('session-1', '', {}, null);

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = getErrorOutput();
    assert.match(output.message, /task-index must be a non-negative integer/);
  });
});
