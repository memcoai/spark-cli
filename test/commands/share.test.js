import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { shareCommand } from '../../src/commands/share.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('shareCommand', () => {
  const mocks = setupCommandMocks();

  it('errors on invalid env tag format', async () => {
    await shareCommand(
      'session-1',
      {
        title: 'Test',
        content: 'Content',
        env: 'bare-tag',
      },
      null,
    );

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid task tag format', async () => {
    await shareCommand(
      'session-1',
      {
        title: 'Test',
        content: 'Content',
        tags: 'no-colon',
      },
      null,
    );

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid version in env tag', async () => {
    await shareCommand(
      'session-1',
      {
        title: 'Test',
        content: 'Content',
        env: 'language_version:python:latest',
      },
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

    it('passes task_idx as string when taskIndex is "new"', async () => {
      await shareCommand('session-1', { title: 'T', content: 'C', taskIndex: 'new' }, null);

      const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
      assert.strictEqual(body.task_idx, 'new');
    });

    it('passes numeric task_idx as string', async () => {
      await shareCommand('session-1', { title: 'T', content: 'C', taskIndex: '5' }, null);

      const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
      assert.strictEqual(body.task_idx, '5');
    });
  });
});
