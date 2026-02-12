import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackCommand } from '../../src/commands/feedback.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('feedbackCommand', () => {
  const mocks = setupCommandMocks();

  it('errors when neither --helpful nor --not-helpful is set', async () => {
    await feedbackCommand('session-1', {}, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);

    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Must specify either --helpful or --not-helpful/);
  });
});
