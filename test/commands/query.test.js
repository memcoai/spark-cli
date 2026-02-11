import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { queryCommand } from '../../src/commands/query.js';

describe('queryCommand', () => {
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
    await queryCommand('test query', { env: 'invalid' }, null);

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = JSON.parse(logMock.mock.calls[0].arguments[0]);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid task tag format', async () => {
    await queryCommand('test query', { tags: 'notvalid' }, null);

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = JSON.parse(logMock.mock.calls[0].arguments[0]);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid version in env tag', async () => {
    await queryCommand('test query', { env: 'language_version:node:latest' }, null);

    assert.strictEqual(exitMock.mock.calls.length, 1);
    const output = JSON.parse(logMock.mock.calls[0].arguments[0]);
    assert.match(output.message, /Invalid version/);
  });
});
