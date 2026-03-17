import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shareTaskCommand } from '../../src/commands/share-task.js';
import {
  setupCommandMocks,
  setupFetchMock,
  tagValidationTests,
  xmlTagValidationTests,
} from '../helpers.js';

describe('shareTaskCommand', () => {
  const mocks = setupCommandMocks();

  tagValidationTests(mocks, shareTaskCommand, () => [
    'test query',
    { title: 'some title', content: 'some content' },
  ]);
  xmlTagValidationTests(mocks, shareTaskCommand, () => [
    'test query',
    { title: 'some title', content: 'some content' },
  ]);

  describe('API calls', () => {
    const api = setupFetchMock();

    it('sends tags as XML in request body', async () => {
      await shareTaskCommand(
        'test query',
        {
          title: 'some title',
          content: 'some content',
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
      await shareTaskCommand('test query', { title: 'some title', content: 'some content' }, null);

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.strictEqual(body.tags, undefined);
    });

    it('sends --xml-tag values in request body', async () => {
      await shareTaskCommand(
        'test query',
        {
          title: 'some title',
          content: 'some content',
          xmlTag: ['<tag type="task_type" name="bug_fix" />'],
        },
        null,
      );

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.deepStrictEqual(body.tags, ['<tag type="task_type" name="bug_fix" />']);
    });

    it('merges --tag and --xml-tag into request body', async () => {
      await shareTaskCommand(
        'test query',
        {
          title: 'some title',
          content: 'some content',
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
