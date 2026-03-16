import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shareCommand } from '../../src/commands/share.js';
import {
  setupCommandMocks,
  setupFetchMock,
  tagValidationTests,
  xmlTagValidationTests,
} from '../helpers.js';

describe('shareCommand', () => {
  const mocks = setupCommandMocks();

  tagValidationTests(mocks, shareCommand, () => [
    'session-1',
    { title: 'Test', content: 'Content', taskIndex: '0' },
  ]);
  xmlTagValidationTests(mocks, shareCommand, () => [
    'session-1',
    { title: 'Test', content: 'Content', taskIndex: '0' },
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

    it('sends tags as XML in request body', async () => {
      await shareCommand(
        'session-1',
        {
          title: 'T',
          content: 'C',
          taskIndex: '0',
          tag: ['language:python:3.11', 'task_type:bug_fix'],
        },
        null,
      );

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.deepStrictEqual(body.tags, [
        '<tag type="language" name="python" version="3.11" />',
        '<tag type="task_type" name="bug_fix" />',
      ]);
    });

    it('omits tags when --tag is not provided', async () => {
      await shareCommand('session-1', { title: 'T', content: 'C', taskIndex: '0' }, null);

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.strictEqual(body.tags, undefined);
    });

    it('sends --xml-tag values in request body', async () => {
      await shareCommand(
        'session-1',
        {
          title: 'T',
          content: 'C',
          taskIndex: '0',
          xmlTag: ['<tag type="task_type" name="bug_fix" />'],
        },
        null,
      );

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.deepStrictEqual(body.tags, ['<tag type="task_type" name="bug_fix" />']);
    });

    it('merges --tag and --xml-tag into request body', async () => {
      await shareCommand(
        'session-1',
        {
          title: 'T',
          content: 'C',
          taskIndex: '0',
          tag: ['language:python:3.11'],
          xmlTag: ['<tag type="task_type" name="bug_fix" />'],
        },
        null,
      );

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.deepStrictEqual(body.tags, [
        '<tag type="language" name="python" version="3.11" />',
        '<tag type="task_type" name="bug_fix" />',
      ]);
    });
  });
});
