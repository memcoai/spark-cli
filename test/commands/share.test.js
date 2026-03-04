import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shareCommand } from '../../src/commands/share.js';
import { setupCommandMocks, setupFetchMock, tagValidationTests } from '../helpers.js';

describe('shareCommand', () => {
  const mocks = setupCommandMocks();

  tagValidationTests(mocks, shareCommand, () => [
    'session-1',
    { title: 'Test', content: 'Content' },
  ]);

  describe('API calls', () => {
    const api = setupFetchMock();

    it('passes task_idx as string when taskIndex is "new"', async () => {
      await shareCommand('session-1', { title: 'T', content: 'C', taskIndex: 'new' }, null);

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.strictEqual(body.task_idx, 'new');
    });

    it('passes numeric task_idx as string', async () => {
      await shareCommand('session-1', { title: 'T', content: 'C', taskIndex: '5' }, null);

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.strictEqual(body.task_idx, '5');
    });
  });
});
