import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shareTaskCommand } from '../../src/commands/share-task.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('shareTaskCommand', () => {
  const mocks = setupCommandMocks();

  it('errors on invalid env tag format', async () => {
    await shareTaskCommand('test query', { insight: ['some insight'], env: 'invalid' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid task tag format', async () => {
    await shareTaskCommand('test query', { insight: ['some insight'], tags: 'notvalid' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid version in env tag', async () => {
    await shareTaskCommand(
      'test query',
      { insight: ['some insight'], env: 'language_version:node:latest' },
      null,
    );

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /Invalid version/);
  });
});
