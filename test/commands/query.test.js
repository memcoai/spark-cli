import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryCommand } from '../../src/commands/query.js';
import { setupCommandMocks, getErrorOutput } from '../helpers.js';

describe('queryCommand', () => {
  const mocks = setupCommandMocks();

  it('errors on invalid tag format', async () => {
    await queryCommand('test query', { tag: 'invalid' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid version in tag', async () => {
    await queryCommand('test query', { tag: 'language:node:latest' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /Invalid version/);
  });

  it('errors on invalid tag in array format', async () => {
    await queryCommand('test query', { tag: ['language:python:3.11', 'invalid'] }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /Invalid tag/);
  });
});
