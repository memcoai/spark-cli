import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runUninstall } from '../../src/commands/uninstall.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput, npmExecErrorCases } from '../helpers.js';

function initReadKey(initValue, globalInitValue = null, projects = null) {
  return mock.fn((path, key) => {
    if (key === 'init') return initValue;
    if (key === 'globalInit') return globalInitValue;
    if (key === 'projects') return projects;
    return null;
  });
}

function makeDeps(overrides = {}) {
  return {
    exec: mock.fn(),
    execAsync: mock.fn(async () => ({ stdout: '', stderr: '' })),
    spawnInteractive: mock.fn(async () => {}),
    readKey: mock.fn(() => null),
    writeKey: mock.fn(),
    rm: mock.fn(),
    ...overrides,
  };
}

describe('runUninstall', () => {
  const mocks = setupCommandMocks();

  it('shows success message on successful uninstall', async () => {
    await runUninstall(makeDeps());

    assert.ok(getStdoutOutput(mocks.stdoutMock).includes('Successfully uninstalled @memco/spark'));
  });

  it('calls npm uninstall with correct command and options', async () => {
    const deps = makeDeps();
    await runUninstall(deps);

    assert.strictEqual(deps.exec.mock.calls.length, 1);
    assert.strictEqual(deps.exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
    const opts = deps.exec.mock.calls[0].arguments[1];
    assert.strictEqual(opts.encoding, 'utf8');
    assert.strictEqual(opts.timeout, 60000);
  });

  for (const { name, error, expected } of npmExecErrorCases) {
    it(name, async () => {
      const throwingExec = mock.fn(() => {
        throw error;
      });
      await runUninstall(makeDeps({ exec: throwingExec }));

      assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);
      assert.ok(getLogOutput(mocks.logMock).includes(expected));
    });
  }
});

describe('runUninstall — Claude Code plugin removal', () => {
  const mocks = setupCommandMocks();

  it('uninstalls claude plugin with project scope when local init has claude', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude'] }) });
    await runUninstall(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 1);
    const [cmd, args] = deps.execAsync.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'claude');
    assert.deepStrictEqual(args, ['plugin', 'uninstall', 'spark-cli@MemCo', '--scope', 'project']);
  });

  it('uninstalls claude plugin with user scope when globalInit has claude', async () => {
    const deps = makeDeps({ readKey: initReadKey(null, { ides: ['claude'] }) });
    await runUninstall(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 1);
    const [cmd, args] = deps.execAsync.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'claude');
    assert.deepStrictEqual(args, ['plugin', 'uninstall', 'spark-cli@MemCo', '--scope', 'user']);
  });

  it('does not call claude uninstall when ides does not include claude', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['other'] }) });
    await runUninstall(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 0);
  });

  it('does not call claude uninstall when no init settings exist', async () => {
    const deps = makeDeps();
    await runUninstall(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 0);
  });

  it('continues with npm uninstall when claude plugin removal fails', async () => {
    const deps = makeDeps({
      execAsync: mock.fn(async () => {
        throw new Error('claude not found');
      }),
      readKey: initReadKey({ ides: ['claude'] }),
    });
    await runUninstall(deps);

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Failed to remove Claude Code plugin'));
    assert.strictEqual(deps.exec.mock.calls.length, 1);
    assert.strictEqual(deps.exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
  });
});

describe('runUninstall — Other IDEs skills removal', () => {
  const mocks = setupCommandMocks();

  it('removes skills for project scope when local init has other', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['other'] }) });
    await runUninstall(deps);

    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 1);
    const [cmd, args] = deps.spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'npx');
    assert.deepStrictEqual(args, ['skills', 'remove', 'memcoai/spark-cli-skills']);
  });

  it('removes skills with --global flag for global scope', async () => {
    const deps = makeDeps({ readKey: initReadKey(null, { ides: ['other'] }) });
    await runUninstall(deps);

    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 1);
    const [cmd, args] = deps.spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'npx');
    assert.deepStrictEqual(args, ['skills', 'remove', 'memcoai/spark-cli-skills', '--global']);
  });

  it('does not call skills remove when ides does not include other', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude'] }) });
    await runUninstall(deps);

    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 0);
  });

  it('continues with npm uninstall when skills removal fails', async () => {
    const deps = makeDeps({
      spawnInteractive: mock.fn(async () => {
        throw new Error('npx exited with code 1');
      }),
      readKey: initReadKey({ ides: ['other'] }),
    });
    await runUninstall(deps);

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Failed to remove skills'));
    assert.strictEqual(deps.exec.mock.calls.length, 1);
    assert.strictEqual(deps.exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
  });
});

describe('runUninstall — both IDEs', () => {
  setupCommandMocks();

  it('uninstalls both claude plugin and skills when both ides are set', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude', 'other'] }) });
    await runUninstall(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 1);
    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 1);

    const [claudeCmd, claudeArgs] = deps.execAsync.mock.calls[0].arguments;
    assert.strictEqual(claudeCmd, 'claude');
    assert.deepStrictEqual(claudeArgs, [
      'plugin',
      'uninstall',
      'spark-cli@MemCo',
      '--scope',
      'project',
    ]);

    const [npxCmd, npxArgs] = deps.spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(npxCmd, 'npx');
    assert.deepStrictEqual(npxArgs, ['skills', 'remove', 'memcoai/spark-cli-skills']);
  });
});

describe('runUninstall — init data cleanup', () => {
  setupCommandMocks();

  it('removes local init key after uninstalling project-scoped IDEs', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude'] }) });
    await runUninstall(deps);

    const initRemoval = deps.writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'init' && c.arguments[2] === null,
    );
    assert.ok(initRemoval, 'should remove init key from local settings');
  });

  it('removes globalInit key after uninstalling global-scoped IDEs', async () => {
    const deps = makeDeps({ readKey: initReadKey(null, { ides: ['other'] }) });
    await runUninstall(deps);

    const globalInitRemoval = deps.writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'globalInit' && c.arguments[2] === null,
    );
    assert.ok(globalInitRemoval, 'should remove globalInit key from global settings');
  });

  it('removes project entry from global projects array for project scope', async () => {
    const cwd = process.cwd();
    const deps = makeDeps({
      readKey: initReadKey({ ides: ['claude'] }, null, [
        { path: cwd, ides: ['claude'] },
        { path: '/other', ides: ['other'] },
      ]),
    });
    await runUninstall(deps);

    const projectsWrite = deps.writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'projects' && c.arguments[2] !== null,
    );
    assert.ok(projectsWrite, 'should update projects array');
    assert.deepStrictEqual(projectsWrite.arguments[2], [{ path: '/other', ides: ['other'] }]);
  });

  it('sets projects to null when current project is the only entry', async () => {
    const cwd = process.cwd();
    const deps = makeDeps({
      readKey: initReadKey({ ides: ['claude'] }, null, [{ path: cwd, ides: ['claude'] }]),
    });
    await runUninstall(deps);

    const projectsWrite = deps.writeKey.mock.calls.find((c) => c.arguments[1] === 'projects');
    assert.ok(projectsWrite, 'should update projects key');
    assert.strictEqual(projectsWrite.arguments[2], null, 'should set projects to null when empty');
  });

  it('does not touch projects array for global scope', async () => {
    const deps = makeDeps({ readKey: initReadKey(null, { ides: ['claude'] }) });
    await runUninstall(deps);

    const projectsWrite = deps.writeKey.mock.calls.find((c) => c.arguments[1] === 'projects');
    assert.strictEqual(projectsWrite, undefined, 'should not touch projects for global scope');
  });

  it('does not call writeKey when no init data exists', async () => {
    const deps = makeDeps();
    await runUninstall(deps);

    assert.strictEqual(deps.writeKey.mock.calls.length, 0);
  });
});

describe('runUninstall — .spark directory cleanup', () => {
  setupCommandMocks();

  it('removes both local and global .spark directories after successful uninstall', async () => {
    const deps = makeDeps();
    await runUninstall(deps);

    assert.strictEqual(deps.rm.mock.calls.length, 2);
    for (const call of deps.rm.mock.calls) {
      assert.deepStrictEqual(call.arguments[1], { recursive: true, force: true });
    }
  });

  it('does not remove directories when npm uninstall fails', async () => {
    const error = new Error('npm failure');
    error.stderr = 'npm failure';
    const deps = makeDeps({
      exec: mock.fn(() => {
        throw error;
      }),
    });
    await runUninstall(deps);

    assert.strictEqual(deps.rm.mock.calls.length, 0);
  });

  it('continues successfully when directory removal throws', async () => {
    const deps = makeDeps({
      rm: mock.fn(() => {
        throw new Error('EPERM');
      }),
    });
    await runUninstall(deps);

    assert.strictEqual(deps.rm.mock.calls.length, 2);
  });
});
