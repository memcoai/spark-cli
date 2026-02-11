import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackCommand } from '../../src/commands/feedback.js';

describe('feedbackCommand', () => {
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

  it('errors when neither --helpful nor --not-helpful is set', async () => {
    await feedbackCommand('session-1', {}, null);

    assert.strictEqual(exitMock.mock.calls.length, 1);
    assert.strictEqual(exitMock.mock.calls[0].arguments[0], 1);

    const output = JSON.parse(logMock.mock.calls[0].arguments[0]);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Must specify either --helpful or --not-helpful/);
  });
});
