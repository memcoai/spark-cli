import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runUninstall } from '../../src/commands/uninstall.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput } from '../helpers.js';

describe('runUninstall', () => {
  const mocks = setupCommandMocks();

  const throwingExec = (err) =>
    mock.fn(() => {
      throw err;
    });

  it('shows success message on successful uninstall', async () => {
    await runUninstall({ exec: mock.fn() });

    assert.ok(getStdoutOutput(mocks.stdoutMock).includes('Successfully uninstalled @memco/spark'));
  });

  it('calls npm uninstall with correct command and options', async () => {
    const exec = mock.fn();
    await runUninstall({ exec });

    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
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
      await runUninstall({ exec: throwingExec(error) });

      assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);
      assert.ok(getLogOutput(mocks.logMock).includes(expected));
    });
  }
});
