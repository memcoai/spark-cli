import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { shareTaskCommand } from '../../src/commands/share-task.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('shareTaskCommand', () => {
  const mocks = setupCommandMocks();

  it('errors on invalid tag format', async () => {
    await shareTaskCommand('test query', { insight: ['some insight'], tag: 'invalid' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid tag in array format', async () => {
    await shareTaskCommand(
      'test query',
      { insight: ['some insight'], tag: ['language:python:3.11', 'invalid'] },
      null,
    );

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid version in tag', async () => {
    await shareTaskCommand(
      'test query',
      { insight: ['some insight'], tag: 'language:node:latest' },
      null,
    );

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /Invalid version/);
  });

  describe('API calls', () => {
    let fetchMock;
    let originalKey;

    beforeEach(() => {
      originalKey = process.env.SPARK_API_KEY;
      process.env.SPARK_API_KEY = 'test-key';
      fetchMock = mock.method(globalThis, 'fetch', () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      );
    });

    afterEach(() => {
      fetchMock.mock.restore();
      if (originalKey === undefined) delete process.env.SPARK_API_KEY;
      else process.env.SPARK_API_KEY = originalKey;
    });

    it('sends tags as XML in request body', async () => {
      await shareTaskCommand(
        'test query',
        { insight: ['some insight'], tag: ['language:python:3.11', 'task_type:bug_fix'] },
        null,
      );

      const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
      assert.deepStrictEqual(body.tags, [
        '<tag type="language" name="python" version="3.11" />',
        '<tag type="task_type" name="bug_fix" />',
      ]);
    });

    it('omits tags when --tag is not provided', async () => {
      await shareTaskCommand('test query', { insight: ['some insight'] }, null);

      const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
      assert.strictEqual(body.tags, undefined);
    });
  });
});
