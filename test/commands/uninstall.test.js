import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runUninstall } from '../../src/commands/uninstall.js';

describe('uninstallCommand', () => {
  let logMock;
  let exitMock;
  let stdoutMock;

  beforeEach(() => {
    logMock = mock.method(console, 'log');
    exitMock = mock.method(process, 'exit', () => {});
    stdoutMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    logMock.mock.restore();
    exitMock.mock.restore();
    stdoutMock.mock.restore();
  });

  const getLogOutput = (m) => m.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
  const getStdoutOutput = (m) => m.mock.calls.map((c) => c.arguments[0]).join('');
  const throwingExec = (err) => mock.fn(() => { throw err; });

  it('shows success message on successful uninstall', async () => {
    await runUninstall({ exec: mock.fn() });

    assert.ok(getStdoutOutput(stdoutMock).includes('Successfully uninstalled @memco/spark'));
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

      assert.strictEqual(exitMock.mock.calls[0].arguments[0], 1);
      assert.ok(getLogOutput(logMock).includes(expected));
    });
  }
});
