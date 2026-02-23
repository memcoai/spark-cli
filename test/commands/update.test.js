import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runUpdate } from '../../src/commands/update.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput } from '../helpers.js';

describe('updateCommand', () => {
  const mocks = setupCommandMocks();

  it('shows already on latest when version is unchanged', async () => {
    const exec = mock.fn(() => '');
    const getVersion = mock.fn(() => '1.0.0');

    await runUpdate({ exec, getVersion });

    const output = getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Already on the latest version (v1.0.0)'));
  });

  it('shows updated message when version changes', async () => {
    const exec = mock.fn(() => '');
    let callCount = 0;
    const getVersion = mock.fn(() => {
      callCount++;
      return callCount === 1 ? '1.0.0' : '1.1.0';
    });

    await runUpdate({ exec, getVersion });

    const output = getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Updated @memco/spark: v1.0.0'));
    assert.ok(output.includes('v1.1.0'));
  });

  it('calls npm install with correct command and options', async () => {
    const exec = mock.fn(() => '');
    const getVersion = mock.fn(() => '1.0.0');

    await runUpdate({ exec, getVersion });

    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'npm install -g @memco/spark@latest');
    const opts = exec.mock.calls[0].arguments[1];
    assert.strictEqual(opts.encoding, 'utf8');
    assert.strictEqual(opts.timeout, 60000);
  });

  const errorCases = [
    {
      name: 'shows npm-not-found message on ENOENT',
      error: Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' }),
      expected: 'npm is not installed or not in PATH',
    },
    {
      name: 'shows permission message on EACCES',
      error: Object.assign(new Error('permission denied'), { code: 'EACCES' }),
      expected: 'Permission denied',
    },
    {
      name: 'prints stderr message on npm failure',
      error: Object.assign(new Error('command failed'), { stderr: '  npm ERR! network error  ' }),
      expected: 'npm ERR! network error',
    },
    {
      name: 'falls back to error message when stderr is empty',
      error: Object.assign(new Error('ETIMEOUT'), { stderr: '' }),
      expected: 'ETIMEOUT',
    },
  ];

  for (const { name, error, expected } of errorCases) {
    it(name, async () => {
      const exec = mock.fn(() => {
        throw error;
      });
      const getVersion = mock.fn(() => '1.0.0');

      await runUpdate({ exec, getVersion });

      assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);
      assert.ok(getLogOutput(mocks.logMock).includes(expected));
    });
  }

  it('prints current version before updating', async () => {
    const exec = mock.fn(() => '');
    const getVersion = mock.fn(() => '2.3.4');

    await runUpdate({ exec, getVersion });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Current version: v2.3.4'));
  });

  it('does not call getVersion a second time on failure', async () => {
    const exec = mock.fn(() => {
      throw new Error('fail');
    });
    const getVersion = mock.fn(() => '1.0.0');

    await runUpdate({ exec, getVersion });

    assert.strictEqual(getVersion.mock.calls.length, 1);
  });
});
