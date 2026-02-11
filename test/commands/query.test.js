import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryCommand } from '../../src/commands/query.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('queryCommand', () => {
  const mocks = setupCommandMocks();

  it('errors on invalid env tag format', async () => {
    await queryCommand('test query', { env: 'invalid' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid task tag format', async () => {
    await queryCommand('test query', { tags: 'notvalid' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid version in env tag', async () => {
    await queryCommand('test query', { env: 'language_version:node:latest' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /Invalid version/);
  });
});