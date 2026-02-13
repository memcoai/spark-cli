import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runUpdate } from '../../src/commands/update.js';

describe('updateCommand', () => {
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

  it('shows already on latest when version is unchanged', async () => {
    const exec = mock.fn(() => '');
    const getVersion = mock.fn(() => '1.0.0');

    await runUpdate({ exec, getVersion });

    const output = stdoutMock.mock.calls.map((c) => c.arguments[0]).join('');
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

    const output = stdoutMock.mock.calls.map((c) => c.arguments[0]).join('');
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

  it('exits with code 1 on npm failure', async () => {
    const exec = mock.fn(() => {
      throw new Error('npm ERR! command failed');
    });
    const getVersion = mock.fn(() => '1.0.0');

    await runUpdate({ exec, getVersion });

    assert.strictEqual(exitMock.mock.calls.length, 1);
    assert.strictEqual(exitMock.mock.calls[0].arguments[0], 1);
  });

  it('prints stderr message on npm failure', async () => {
    const err = new Error('command failed');
    err.stderr = '  npm ERR! network error  ';
    const exec = mock.fn(() => {
      throw err;
    });
    const getVersion = mock.fn(() => '1.0.0');

    await runUpdate({ exec, getVersion });

    const output = logMock.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(output.includes('npm ERR! network error'));
  });

  it('shows npm-not-found message on ENOENT', async () => {
    const err = new Error('spawn npm ENOENT');
    err.code = 'ENOENT';
    const exec = mock.fn(() => {
      throw err;
    });
    const getVersion = mock.fn(() => '1.0.0');

    await runUpdate({ exec, getVersion });

    const output = logMock.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(output.includes('npm is not installed or not in PATH'));
  });

  it('shows permission message on EACCES', async () => {
    const err = new Error('permission denied');
    err.code = 'EACCES';
    const exec = mock.fn(() => {
      throw err;
    });
    const getVersion = mock.fn(() => '1.0.0');

    await runUpdate({ exec, getVersion });

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
    const getVersion = mock.fn(() => '1.0.0');

    await runUpdate({ exec, getVersion });

    const output = logMock.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(output.includes('ETIMEOUT'));
  });

  it('prints current version before updating', async () => {
    const exec = mock.fn(() => '');
    const getVersion = mock.fn(() => '2.3.4');

    await runUpdate({ exec, getVersion });

    const output = logMock.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
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
