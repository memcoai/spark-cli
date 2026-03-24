import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackCommand } from '../../src/commands/feedback.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('feedbackCommand', () => {
  const mocks = setupCommandMocks();

  const errorCases = [
    {
      name: 'errors when no --feedback entries are provided',
      opts: { feedback: [] },
      errorMatch: /At least one --feedback entry is required/,
    },
    {
      name: 'errors on invalid feedback XML',
      opts: { feedback: ['not xml'] },
      errorMatch: /Invalid feedback entry/,
    },
    {
      name: 'errors on missing required attributes',
      opts: { feedback: ["<feedback idx='rec-1' relevant='true'></feedback>"] },
      errorMatch: /missing required "correct"/,
    },
  ];

  for (const { name, opts, errorMatch } of errorCases) {
    it(name, async () => {
      await feedbackCommand('session-1', opts, null);

      assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
      assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);

      const output = getErrorOutput(mocks.logMock);
      assert.strictEqual(output.error, true);
      assert.match(output.message, errorMatch);
    });
  }
});
