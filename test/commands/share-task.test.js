import { describe, it } from 'node:test';
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
});
