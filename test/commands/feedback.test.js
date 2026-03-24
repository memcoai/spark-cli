import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackCommand } from '../../src/commands/feedback.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('feedbackCommand', () => {
  const mocks = setupCommandMocks();

  it('errors when no --feedback entries are provided', async () => {
    await feedbackCommand('session-1', { feedback: [] }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);

    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /At least one --feedback entry is required/);
  });

  it('errors on invalid feedback XML', async () => {
    await feedbackCommand('session-1', { feedback: ['not xml'] }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);

    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid feedback entry/);
  });

  it('errors on missing required attributes', async () => {
    await feedbackCommand(
      'session-1',
      { feedback: ["<feedback idx='rec-1' relevant='true'></feedback>"] },
      null,
    );

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);

    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /"correct" must be/);
  });
});
