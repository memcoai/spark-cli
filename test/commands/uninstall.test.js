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

  const noopExec = () => mock.fn();
  const noopExecAsync = () => mock.fn(async () => ({ stdout: '', stderr: '' }));
  const noopSpawn = () => mock.fn(async () => {});
  const noInitReadKey = () => mock.fn(() => null);

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
      await runUninstall({ exec: throwingExec(error), readKey: noInitReadKey() });

      assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);
      assert.ok(getLogOutput(mocks.logMock).includes(expected));
    });
  }
});

describe('runUninstall — Claude Code plugin removal', () => {
  const mocks = setupCommandMocks();

  it('uninstalls claude plugin with project scope when local init has claude', async () => {
    const execAsync = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return { ides: ['claude'] };
      return null;
    });

    await runUninstall({ exec: mock.fn(), execAsync, readKey });

    assert.strictEqual(execAsync.mock.calls.length, 1);
    const [cmd, args] = execAsync.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'claude');
    assert.deepStrictEqual(args, ['plugin', 'uninstall', 'spark-cli@MemCo', '--scope', 'project']);
  });

  it('uninstalls claude plugin with user scope when globalInit has claude', async () => {
    const execAsync = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return null;
      if (key === 'globalInit') return { ides: ['claude'] };
      return null;
    });

    await runUninstall({ exec: mock.fn(), execAsync, readKey });

    assert.strictEqual(execAsync.mock.calls.length, 1);
    const [cmd, args] = execAsync.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'claude');
    assert.deepStrictEqual(args, ['plugin', 'uninstall', 'spark-cli@MemCo', '--scope', 'user']);
  });

  it('does not call claude uninstall when ides does not include claude', async () => {
    const execAsync = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const spawnInteractive = mock.fn(async () => {});
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return { ides: ['other'] };
      return null;
    });

    await runUninstall({ exec: mock.fn(), execAsync, spawnInteractive, readKey });

    assert.strictEqual(execAsync.mock.calls.length, 0);
  });

  it('does not call claude uninstall when no init settings exist', async () => {
    const execAsync = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const readKey = mock.fn(() => null);

    await runUninstall({ exec: mock.fn(), execAsync, readKey });

    assert.strictEqual(execAsync.mock.calls.length, 0);
  });

  it('continues with npm uninstall when claude plugin removal fails', async () => {
    const execAsync = mock.fn(async () => {
      throw new Error('claude not found');
    });
    const exec = mock.fn();
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return { ides: ['claude'] };
      return null;
    });

    await runUninstall({ exec, execAsync, readKey });

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Failed to remove Claude Code plugin'));
    // npm uninstall still called
    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
  });
});

describe('runUninstall — Other IDEs skills removal', () => {
  const mocks = setupCommandMocks();

  it('removes skills for project scope when local init has other', async () => {
    const spawnInteractive = mock.fn(async () => {});
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return { ides: ['other'] };
      return null;
    });

    await runUninstall({ exec: mock.fn(), spawnInteractive, readKey });

    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
    const [cmd, args] = spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'npx');
    assert.deepStrictEqual(args, ['skills', 'remove', 'memcoai/spark-cli-skills']);
  });

  it('removes skills with --global flag for global scope', async () => {
    const spawnInteractive = mock.fn(async () => {});
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return null;
      if (key === 'globalInit') return { ides: ['other'] };
      return null;
    });

    await runUninstall({ exec: mock.fn(), spawnInteractive, readKey });

    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
    const [cmd, args] = spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'npx');
    assert.deepStrictEqual(args, ['skills', 'remove', 'memcoai/spark-cli-skills', '--global']);
  });

  it('does not call skills remove when ides does not include other', async () => {
    const spawnInteractive = mock.fn(async () => {});
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return { ides: ['claude'] };
      return null;
    });

    await runUninstall({
      exec: mock.fn(),
      execAsync: mock.fn(async () => ({ stdout: '', stderr: '' })),
      spawnInteractive,
      readKey,
    });

    assert.strictEqual(spawnInteractive.mock.calls.length, 0);
  });

  it('continues with npm uninstall when skills removal fails', async () => {
    const spawnInteractive = mock.fn(async () => {
      throw new Error('npx exited with code 1');
    });
    const exec = mock.fn();
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return { ides: ['other'] };
      return null;
    });

    await runUninstall({ exec, spawnInteractive, readKey });

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Failed to remove skills'));
    // npm uninstall still called
    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'npm uninstall -g @memco/spark');
  });
});

describe('runUninstall — both IDEs', () => {
  const mocks = setupCommandMocks();

  it('uninstalls both claude plugin and skills when both ides are set', async () => {
    const execAsync = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const spawnInteractive = mock.fn(async () => {});
    const readKey = mock.fn((path, key) => {
      if (key === 'init') return { ides: ['claude', 'other'] };
      return null;
    });

    await runUninstall({ exec: mock.fn(), execAsync, spawnInteractive, readKey });

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
