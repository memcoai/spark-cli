import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { insightsCommand } from '../../src/commands/insights.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('insightsCommand', () => {
  const mocks = setupCommandMocks();

  const invalidIndices = [
    ['non-numeric', 'abc'],
    ['negative', '-1'],
    ['float', '3.14'],
    ['empty string', ''],
  ];

  for (const [label, value] of invalidIndices) {
    it(`errors on ${label} task index`, async () => {
      await insightsCommand('session-1', value, {}, null);

      assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
      const output = getErrorOutput(mocks.logMock);
      assert.strictEqual(output.error, true);
      assert.match(output.message, /task-index must be a non-negative integer/);
    });
  }
});