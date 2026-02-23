import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runUninstall } from '../../src/commands/uninstall.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput, npmExecErrorCases } from '../helpers.js';

const noopExec = () => mock.fn();
const noopExecAsync = () => mock.fn(async () => ({ stdout: '', stderr: '' }));
const noopSpawnInteractive = () => mock.fn(async () => {});
const noInitReadKey = () => mock.fn(() => null);

const throwingExec = (err) =>
  mock.fn(() => {
    throw err;
  });

function initReadKey(initValue, globalInitValue = null) {
  return mock.fn((path, key) => {
    if (key === 'init') return initValue;
    if (key === 'globalInit') return globalInitValue;
    return null;
  });
}

describe('runUninstall', () => {
  const mocks = setupCommandMocks();

  it('shows success message on successful uninstall', async () => {
    await runUninstall({ exec: noopExec(), readKey: noInitReadKey() });

    assert.ok(getStdoutOutput(mocks.stdoutMock).includes('Successfully uninstalled @memco/spark'));
  });

  it('calls npm uninstall with correct command and options', async () => {
    const exec = noopExec();
    await runUninstall({ exec, readKey: noInitReadKey() });

    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
    const opts = exec.mock.calls[0].arguments[1];
    assert.strictEqual(opts.encoding, 'utf8');
    assert.strictEqual(opts.timeout, 60000);
  });

  for (const { name, error, expected } of npmExecErrorCases) {
    it(name, async () => {
      await runUninstall({ exec: throwingExec(error), readKey: noInitReadKey() });

      assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);
      assert.ok(getLogOutput(mocks.logMock).includes(expected));
    });
  }
});

describe('runUninstall — Claude Code plugin removal', () => {
  const mocks = setupCommandMocks();

  it('uninstalls claude plugin with project scope when local init has claude', async () => {
    const execAsync = noopExecAsync();

    await runUninstall({ exec: noopExec(), execAsync, readKey: initReadKey({ ides: ['claude'] }) });

    assert.strictEqual(execAsync.mock.calls.length, 1);
    const [cmd, args] = execAsync.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'claude');
    assert.deepStrictEqual(args, ['plugin', 'uninstall', 'spark-cli@MemCo', '--scope', 'project']);
  });

  it('uninstalls claude plugin with user scope when globalInit has claude', async () => {
    const execAsync = noopExecAsync();

    await runUninstall({
      exec: noopExec(),
      execAsync,
      readKey: initReadKey(null, { ides: ['claude'] }),
    });

    assert.strictEqual(execAsync.mock.calls.length, 1);
    const [cmd, args] = execAsync.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'claude');
    assert.deepStrictEqual(args, ['plugin', 'uninstall', 'spark-cli@MemCo', '--scope', 'user']);
  });

  it('does not call claude uninstall when ides does not include claude', async () => {
    const execAsync = noopExecAsync();

    await runUninstall({
      exec: noopExec(),
      execAsync,
      spawnInteractive: noopSpawnInteractive(),
      readKey: initReadKey({ ides: ['other'] }),
    });

    assert.strictEqual(execAsync.mock.calls.length, 0);
  });

  it('does not call claude uninstall when no init settings exist', async () => {
    const execAsync = noopExecAsync();

    await runUninstall({ exec: noopExec(), execAsync, readKey: noInitReadKey() });

    assert.strictEqual(execAsync.mock.calls.length, 0);
  });

  it('continues with npm uninstall when claude plugin removal fails', async () => {
    const execAsync = mock.fn(async () => {
      throw new Error('claude not found');
    });
    const exec = noopExec();

    await runUninstall({ exec, execAsync, readKey: initReadKey({ ides: ['claude'] }) });

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Failed to remove Claude Code plugin'));
    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
  });
});

describe('runUninstall — Other IDEs skills removal', () => {
  const mocks = setupCommandMocks();

  it('removes skills for project scope when local init has other', async () => {
    const spawnInteractive = noopSpawnInteractive();

    await runUninstall({
      exec: noopExec(),
      spawnInteractive,
      readKey: initReadKey({ ides: ['other'] }),
    });

    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
    const [cmd, args] = spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'npx');
    assert.deepStrictEqual(args, ['skills', 'remove', 'memcoai/spark-cli-skills']);
  });

  it('removes skills with --global flag for global scope', async () => {
    const spawnInteractive = noopSpawnInteractive();

    await runUninstall({
      exec: noopExec(),
      spawnInteractive,
      readKey: initReadKey(null, { ides: ['other'] }),
    });

    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
    const [cmd, args] = spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'npx');
    assert.deepStrictEqual(args, ['skills', 'remove', 'memcoai/spark-cli-skills', '--global']);
  });

  it('does not call skills remove when ides does not include other', async () => {
    const spawnInteractive = noopSpawnInteractive();

    await runUninstall({
      exec: noopExec(),
      execAsync: noopExecAsync(),
      spawnInteractive,
      readKey: initReadKey({ ides: ['claude'] }),
    });

    assert.strictEqual(spawnInteractive.mock.calls.length, 0);
  });

  it('continues with npm uninstall when skills removal fails', async () => {
    const spawnInteractive = mock.fn(async () => {
      throw new Error('npx exited with code 1');
    });
    const exec = noopExec();

    await runUninstall({ exec, spawnInteractive, readKey: initReadKey({ ides: ['other'] }) });

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Failed to remove skills'));
    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
  });
});

describe('runUninstall — both IDEs', () => {
  setupCommandMocks();

  it('uninstalls both claude plugin and skills when both ides are set', async () => {
    const execAsync = noopExecAsync();
    const spawnInteractive = noopSpawnInteractive();

    await runUninstall({
      exec: noopExec(),
      execAsync,
      spawnInteractive,
      readKey: initReadKey({ ides: ['claude', 'other'] }),
    });

    assert.strictEqual(execAsync.mock.calls.length, 1);
    assert.strictEqual(spawnInteractive.mock.calls.length, 1);

    const [claudeCmd, claudeArgs] = execAsync.mock.calls[0].arguments;
    assert.strictEqual(claudeCmd, 'claude');
    assert.deepStrictEqual(claudeArgs, [
      'plugin',
      'uninstall',
      'spark-cli@MemCo',
      '--scope',
      'project',
    ]);

    const [npxCmd, npxArgs] = spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(npxCmd, 'npx');
    assert.deepStrictEqual(npxArgs, ['skills', 'remove', 'memcoai/spark-cli-skills']);
  });
});
