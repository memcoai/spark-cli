import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runUninstall, getAllInitTargets } from '../../src/commands/uninstall.js';
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
    exists: mock.fn(() => true),
    ...overrides,
  };
}

describe('getAllInitTargets', () => {
  it('returns empty array when no init data exists', () => {
    const readKey = mock.fn(() => null);
    const targets = getAllInitTargets(readKey);
    assert.deepStrictEqual(targets, []);
  });

  it('returns local init target when local init exists', () => {
    const targets = getAllInitTargets(initReadKey({ ides: ['claude'] }));
    assert.strictEqual(targets.length, 1);
    assert.strictEqual(targets[0].scope, 'project');
    assert.strictEqual(targets[0].settingsKey, 'init');
    assert.strictEqual(targets[0].cwd, undefined);
  });

  it('returns global init target when globalInit exists', () => {
    const targets = getAllInitTargets(initReadKey(null, { ides: ['other'] }));
    assert.strictEqual(targets.length, 1);
    assert.strictEqual(targets[0].scope, 'global');
    assert.strictEqual(targets[0].settingsKey, 'globalInit');
  });

  it('returns both local and global targets when both exist', () => {
    const targets = getAllInitTargets(initReadKey({ ides: ['claude'] }, { ides: ['other'] }));
    assert.strictEqual(targets.length, 2);
    assert.strictEqual(targets[0].scope, 'project');
    assert.strictEqual(targets[1].scope, 'global');
  });

  it('includes remote projects from the projects array', () => {
    const projects = [
      { path: '/remote/project', ides: ['claude'] },
      { path: '/another/project', ides: ['other'] },
    ];
    const targets = getAllInitTargets(initReadKey(null, null, projects));
    assert.strictEqual(targets.length, 2);
    assert.strictEqual(targets[0].cwd, '/remote/project');
    assert.strictEqual(targets[0].scope, 'project');
    assert.strictEqual(targets[0].settingsKey, null);
    assert.strictEqual(targets[1].cwd, '/another/project');
  });

  it('excludes current directory from the projects array', () => {
    const cwd = process.cwd();
    const projects = [
      { path: cwd, ides: ['claude'] },
      { path: '/other/project', ides: ['other'] },
    ];
    const targets = getAllInitTargets(initReadKey(null, null, projects));
    assert.strictEqual(targets.length, 1);
    assert.strictEqual(targets[0].cwd, '/other/project');
  });

  it('skips projects with no ides', () => {
    const projects = [{ path: '/empty/project', ides: [] }, { path: '/no-ides/project' }];
    const targets = getAllInitTargets(initReadKey(null, null, projects));
    assert.strictEqual(targets.length, 0);
  });
});

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

describe('runUninstall — multi-target cleanup', () => {
  const mocks = setupCommandMocks();

  it('processes both local and global init when both exist', async () => {
    const deps = makeDeps({
      readKey: initReadKey({ ides: ['claude'] }, { ides: ['other'] }),
    });
    await runUninstall(deps);

    // claude plugin from local init + skills from global init
    assert.strictEqual(deps.execAsync.mock.calls.length, 1);
    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 1);

    const [, claudeArgs] = deps.execAsync.mock.calls[0].arguments;
    assert.deepStrictEqual(claudeArgs, [
      'plugin',
      'uninstall',
      'spark-cli@MemCo',
      '--scope',
      'project',
    ]);

    const [, npxArgs] = deps.spawnInteractive.mock.calls[0].arguments;
    assert.deepStrictEqual(npxArgs, ['skills', 'remove', 'memcoai/spark-cli-skills', '--global']);
  });

  it('processes remote projects from the projects array', async () => {
    const projects = [{ path: '/remote/project', ides: ['claude'] }];
    const deps = makeDeps({
      readKey: initReadKey(null, null, projects),
    });
    await runUninstall(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 1);
    const [cmd, args, opts] = deps.execAsync.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'claude');
    assert.deepStrictEqual(args, ['plugin', 'uninstall', 'spark-cli@MemCo', '--scope', 'project']);
    assert.deepStrictEqual(opts, { cwd: '/remote/project' });
  });

  it('passes cwd to spawnInteractive for remote project skills removal', async () => {
    const projects = [{ path: '/remote/project', ides: ['other'] }];
    const deps = makeDeps({
      readKey: initReadKey(null, null, projects),
    });
    await runUninstall(deps);

    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 1);
    const [cmd, args, opts] = deps.spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'npx');
    assert.deepStrictEqual(args, ['skills', 'remove', 'memcoai/spark-cli-skills']);
    assert.deepStrictEqual(opts, { cwd: '/remote/project' });
  });

  it('skips remote projects when directory does not exist', async () => {
    const projects = [{ path: '/missing/project', ides: ['claude'] }];
    const deps = makeDeps({
      readKey: initReadKey(null, null, projects),
      exists: mock.fn(() => false),
    });
    await runUninstall(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 0);
    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Skipping /missing/project'));
  });

  it('does not duplicate current directory from projects array when local init exists', async () => {
    const cwd = process.cwd();
    const projects = [
      { path: cwd, ides: ['claude'] },
      { path: '/other/project', ides: ['claude'] },
    ];
    const deps = makeDeps({
      readKey: initReadKey({ ides: ['claude'] }, null, projects),
    });
    await runUninstall(deps);

    // 2 calls: one for local init (cwd), one for /other/project
    assert.strictEqual(deps.execAsync.mock.calls.length, 2);
    // First call should have empty options (local init, no cwd)
    assert.deepStrictEqual(deps.execAsync.mock.calls[0].arguments[2], {});
    // Second call should have cwd for remote project
    assert.deepStrictEqual(deps.execAsync.mock.calls[1].arguments[2], {
      cwd: '/other/project',
    });
  });

  it('continues processing remaining targets when one remote project fails', async () => {
    let callCount = 0;
    const projects = [
      { path: '/failing/project', ides: ['claude'] },
      { path: '/working/project', ides: ['claude'] },
    ];
    const deps = makeDeps({
      readKey: initReadKey(null, null, projects),
      execAsync: mock.fn(async () => {
        callCount++;
        if (callCount === 1) throw new Error('plugin not found');
        return { stdout: '', stderr: '' };
      }),
    });
    await runUninstall(deps);

    // Both projects should be attempted
    assert.strictEqual(deps.execAsync.mock.calls.length, 2);
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

  it('removes both init and globalInit when both exist', async () => {
    const deps = makeDeps({
      readKey: initReadKey({ ides: ['claude'] }, { ides: ['other'] }),
    });
    await runUninstall(deps);

    const initRemoval = deps.writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'init' && c.arguments[2] === null,
    );
    const globalInitRemoval = deps.writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'globalInit' && c.arguments[2] === null,
    );
    assert.ok(initRemoval, 'should remove init key');
    assert.ok(globalInitRemoval, 'should remove globalInit key');
  });

  it('clears the entire projects array after processing all targets', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude'] }) });
    await runUninstall(deps);

    const projectsClear = deps.writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'projects' && c.arguments[2] === null,
    );
    assert.ok(projectsClear, 'should clear the projects array');
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
