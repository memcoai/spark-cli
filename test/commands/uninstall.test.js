import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runUninstall } from '../../src/commands/uninstall.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput, npmExecErrorCases } from '../helpers.js';

const noopExec = () => mock.fn();
const noopExecAsync = () => mock.fn(async () => ({ stdout: '', stderr: '' }));
const noopSpawnInteractive = () => mock.fn(async () => {});
const noInitReadKey = () => mock.fn(() => null);
const noopWriteKey = () => mock.fn();
const noopRm = () => mock.fn();

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

    await runUninstall({
      exec: noopExec(),
      execAsync,
      readKey: initReadKey({ ides: ['claude'] }),
      writeKey: noopWriteKey(),
    });

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
      writeKey: noopWriteKey(),
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
      writeKey: noopWriteKey(),
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

    await runUninstall({
      exec,
      execAsync,
      readKey: initReadKey({ ides: ['claude'] }),
      writeKey: noopWriteKey(),
    });

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
      writeKey: noopWriteKey(),
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
      writeKey: noopWriteKey(),
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
      writeKey: noopWriteKey(),
    });

    assert.strictEqual(spawnInteractive.mock.calls.length, 0);
  });

  it('continues with npm uninstall when skills removal fails', async () => {
    const spawnInteractive = mock.fn(async () => {
      throw new Error('npx exited with code 1');
    });
    const exec = noopExec();

    await runUninstall({
      exec,
      spawnInteractive,
      readKey: initReadKey({ ides: ['other'] }),
      writeKey: noopWriteKey(),
    });

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
      writeKey: noopWriteKey(),
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

describe('runUninstall — init data cleanup', () => {
  setupCommandMocks();

  it('removes local init key after uninstalling project-scoped IDEs', async () => {
    const writeKey = noopWriteKey();

    await runUninstall({
      exec: noopExec(),
      execAsync: noopExecAsync(),
      readKey: initReadKey({ ides: ['claude'] }),
      writeKey,
    });

    // First writeKey call should remove the init key (set to null)
    const initRemoval = writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'init' && c.arguments[2] === null,
    );
    assert.ok(initRemoval, 'should remove init key from local settings');
  });

  it('removes globalInit key after uninstalling global-scoped IDEs', async () => {
    const writeKey = noopWriteKey();

    await runUninstall({
      exec: noopExec(),
      spawnInteractive: noopSpawnInteractive(),
      readKey: initReadKey(null, { ides: ['other'] }),
      writeKey,
    });

    const globalInitRemoval = writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'globalInit' && c.arguments[2] === null,
    );
    assert.ok(globalInitRemoval, 'should remove globalInit key from global settings');
  });

  it('removes project entry from global projects array for project scope', async () => {
    const cwd = process.cwd();
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return { ides: ['claude'] };
      if (key === 'projects')
        return [
          { path: cwd, ides: ['claude'] },
          { path: '/other', ides: ['other'] },
        ];
      return null;
    });
    const writeKey = noopWriteKey();

    await runUninstall({
      exec: noopExec(),
      execAsync: noopExecAsync(),
      readKey,
      writeKey,
    });

    // Should write filtered projects array (without current project)
    const projectsWrite = writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'projects' && c.arguments[2] !== null,
    );
    assert.ok(projectsWrite, 'should update projects array');
    assert.deepStrictEqual(projectsWrite.arguments[2], [{ path: '/other', ides: ['other'] }]);
  });

  it('sets projects to null when current project is the only entry', async () => {
    const cwd = process.cwd();
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return { ides: ['claude'] };
      if (key === 'projects') return [{ path: cwd, ides: ['claude'] }];
      return null;
    });
    const writeKey = noopWriteKey();

    await runUninstall({
      exec: noopExec(),
      execAsync: noopExecAsync(),
      readKey,
      writeKey,
    });

    const projectsWrite = writeKey.mock.calls.find((c) => c.arguments[1] === 'projects');
    assert.ok(projectsWrite, 'should update projects key');
    assert.strictEqual(projectsWrite.arguments[2], null, 'should set projects to null when empty');
  });

  it('does not touch projects array for global scope', async () => {
    const readKey = initReadKey(null, { ides: ['claude'] });
    const writeKey = noopWriteKey();

    await runUninstall({
      exec: noopExec(),
      execAsync: noopExecAsync(),
      readKey,
      writeKey,
    });

    const projectsWrite = writeKey.mock.calls.find((c) => c.arguments[1] === 'projects');
    assert.strictEqual(projectsWrite, undefined, 'should not touch projects for global scope');
  });

  it('does not call writeKey when no init data exists', async () => {
    const writeKey = noopWriteKey();

    await runUninstall({
      exec: noopExec(),
      readKey: noInitReadKey(),
      writeKey,
    });

    assert.strictEqual(writeKey.mock.calls.length, 0);
  });
});

describe('runUninstall — .spark directory cleanup', () => {
  setupCommandMocks();

  it('removes both local and global .spark directories after successful uninstall', async () => {
    const rm = noopRm();

    await runUninstall({ exec: noopExec(), readKey: noInitReadKey(), rm });

    assert.strictEqual(rm.mock.calls.length, 2);
    // Both calls should use recursive + force
    for (const call of rm.mock.calls) {
      assert.deepStrictEqual(call.arguments[1], { recursive: true, force: true });
    }
  });

  it('does not remove directories when npm uninstall fails', async () => {
    const rm = noopRm();
    const error = new Error('npm failure');
    error.stderr = 'npm failure';

    await runUninstall({ exec: throwingExec(error), readKey: noInitReadKey(), rm });

    assert.strictEqual(rm.mock.calls.length, 0);
  });

  it('continues successfully when directory removal throws', async () => {
    const rm = mock.fn(() => {
      throw new Error('EPERM');
    });

    await runUninstall({ exec: noopExec(), readKey: noInitReadKey(), rm });

    // Should have attempted both directories despite errors
    assert.strictEqual(rm.mock.calls.length, 2);
  });
});
