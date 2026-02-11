import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { insightsCommand } from '../../src/commands/insights.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('insightsCommand', () => {
  const mocks = setupCommandMocks();

  it('errors on non-numeric task index', async () => {
    await insightsCommand('session-1', 'abc', {}, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /task-index must be a non-negative integer/);
  });

  it('errors on negative task index', async () => {
    await insightsCommand('session-1', '-1', {}, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /task-index must be a non-negative integer/);
  });

  it('errors on float task index', async () => {
    await insightsCommand('session-1', '3.14', {}, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /task-index must be a non-negative integer/);
  });

  it('errors on empty string task index', async () => {
    await insightsCommand('session-1', '', {}, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /task-index must be a non-negative integer/);
  });
});