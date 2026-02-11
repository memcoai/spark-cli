import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { shareCommand } from '../../src/commands/share.js';

describe('shareCommand', () => {
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

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = JSON.parse(logMock.mock.calls[0].arguments[0]);
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

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = JSON.parse(logMock.mock.calls[0].arguments[0]);
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

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = JSON.parse(logMock.mock.calls[0].arguments[0]);
    assert.match(output.message, /Invalid version/);
  });

  it('passes task_idx as string when taskIndex is "new"', async () => {
    const originalKey = process.env.SPARK_API_KEY;
    process.env.SPARK_API_KEY = 'test-key';
    const fetchMock = mock.method(globalThis, 'fetch', () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    );

    await shareCommand('session-1', { title: 'T', content: 'C', taskIndex: 'new' }, null);

    const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
    assert.strictEqual(body.task_idx, 'new');
    fetchMock.mock.restore();
    if (originalKey === undefined) delete process.env.SPARK_API_KEY;
    else process.env.SPARK_API_KEY = originalKey;
  });

  it('passes numeric task_idx as string', async () => {
    const originalKey = process.env.SPARK_API_KEY;
    process.env.SPARK_API_KEY = 'test-key';
    const fetchMock = mock.method(globalThis, 'fetch', () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    );

    await shareCommand('session-1', { title: 'T', content: 'C', taskIndex: '5' }, null);

    const body = JSON.parse(fetchMock.mock.calls[0].arguments[1].body);
    assert.strictEqual(body.task_idx, '5');
    fetchMock.mock.restore();
    if (originalKey === undefined) delete process.env.SPARK_API_KEY;
    else process.env.SPARK_API_KEY = originalKey;
  });
});
