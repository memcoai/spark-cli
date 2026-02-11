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
});
