import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryCommand } from '../../src/commands/query.js';
import { setupCommandMocks, setupFetchMock, tagValidationTests } from '../helpers.js';

describe('queryCommand', () => {
  const mocks = setupCommandMocks();

  tagValidationTests(mocks, queryCommand, () => ['test query', {}]);

  describe('API calls', () => {
    const api = setupFetchMock();

    it('sends tags as XML in request body', async () => {
      await queryCommand(
        'test query',
        { tag: ['language:python:3.11', 'task_type:bug_fix'] },
        null,
      );

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.deepStrictEqual(body.tags, [
        '<tag type="language" name="python" version="3.11" />',
        '<tag type="task_type" name="bug_fix" />',
      ]);
    });

    it('sends empty tags array when no --tag provided', async () => {
      await queryCommand('test query', {}, null);

      const body = JSON.parse(api.fetchMock.mock.calls[0].arguments[1].body);
      assert.deepStrictEqual(body.tags, []);
    });
  });
});
