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

  it('shows success message on successful uninstall', async () => {
    const exec = mock.fn(() => '');

    await runUninstall({ exec });

    const output = stdoutMock.mock.calls.map((c) => c.arguments[0]).join('');
    assert.ok(output.includes('Successfully uninstalled @memco/spark'));
  });

  it('calls npm uninstall with correct command and options', async () => {
    const exec = mock.fn(() => '');

    await runUninstall({ exec });

    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
    const opts = exec.mock.calls[0].arguments[1];
    assert.strictEqual(opts.encoding, 'utf8');
    assert.strictEqual(opts.timeout, 60000);
  });

  it('exits with code 1 on npm failure', async () => {
    const exec = mock.fn(() => {
      throw new Error('npm ERR! command failed');
    });

    await runUninstall({ exec });

    assert.strictEqual(exitMock.mock.calls.length, 1);
    assert.strictEqual(exitMock.mock.calls[0].arguments[0], 1);
  });

  it('prints stderr message on npm failure', async () => {
    const err = new Error('command failed');
    err.stderr = '  npm ERR! network error  ';
    const exec = mock.fn(() => {
      throw err;
    });

    await runUninstall({ exec });

    const output = logMock.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(output.includes('npm ERR! network error'));
  });

  it('shows npm-not-found message on ENOENT', async () => {
    const err = new Error('spawn npm ENOENT');
    err.code = 'ENOENT';
    const exec = mock.fn(() => {
      throw err;
    });

    await runUninstall({ exec });

    const output = logMock.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(output.includes('npm is not installed or not in PATH'));
  });

  it('shows permission message on EACCES', async () => {
    const err = new Error('permission denied');
    err.code = 'EACCES';
    const exec = mock.fn(() => {
      throw err;
    });

    await runUninstall({ exec });

    const output = logMock.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(output.includes('Permission denied'));
    assert.ok(output.includes('sudo'));
  });

  it('falls back to error message when stderr is empty', async () => {
    const err = new Error('ETIMEOUT');
    err.stderr = '';
    const exec = mock.fn(() => {
      throw err;
    });

    await runUninstall({ exec });

    const output = logMock.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(output.includes('ETIMEOUT'));
  });
});
