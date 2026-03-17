import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runDisable } from '../../src/commands/disable.js';
import { VARIANTS } from '../../src/constants.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput } from '../helpers.js';

function makeDeps(overrides = {}) {
  return {
    execAsync: mock.fn(async () => ({ stdout: '', stderr: '' })),
    spawnInteractive: mock.fn(async () => {}),
    readKey: mock.fn(() => null),
    writeKey: mock.fn(),
    detect: mock.fn(async () => VARIANTS.public),
    ...overrides,
  };
}

function initReadKey(initValue) {
  return mock.fn((path, key) => {
    if (key === 'init') return initValue;
    if (key === 'projects') return null;
    return null;
  });
}

describe('runDisable', () => {
  const mocks = setupCommandMocks();

  it('shows not-enabled message when no local init data exists', async () => {
    await runDisable(makeDeps());

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Spark is not enabled for this project'));
  });

  it('shows not-enabled message when init data has no ides', async () => {
    await runDisable(makeDeps({ readKey: initReadKey({ ides: [] }) }));

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Spark is not enabled for this project'));
  });

  it('uninstalls Claude plugin with project scope', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude'] }) });
    await runDisable(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 1);
    const [cmd, args] = deps.execAsync.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'claude');
    assert.deepStrictEqual(args, [
      'plugin',
      'uninstall',
      VARIANTS.public.claudePlugin,
      '--scope',
      'project',
    ]);
  });

  it('removes skills when init has other', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['other'] }) });
    await runDisable(deps);

    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 1);
    const [cmd, args] = deps.spawnInteractive.mock.calls[0].arguments;
    assert.strictEqual(cmd, 'npx');
    assert.deepStrictEqual(args, ['skills', 'remove', VARIANTS.public.skillsRepo]);
  });

  it('does not add --global flag for skills removal', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['other'] }) });
    await runDisable(deps);

    const args = deps.spawnInteractive.mock.calls[0].arguments[1];
    assert.ok(!args.includes('--global'));
  });

  it('uninstalls both claude plugin and skills when both ides are set', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude', 'other'] }) });
    await runDisable(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 1);
    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 1);
  });

  it('removes init data from local settings', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude'] }) });
    await runDisable(deps);

    const initRemoval = deps.writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'init' && c.arguments[2] === null,
    );
    assert.ok(initRemoval, 'should remove init key from local settings');
  });

  it('shows success message after disable', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude'] }) });
    await runDisable(deps);

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Spark has been disabled for this project'));
  });

  it('continues when claude plugin removal fails', async () => {
    const deps = makeDeps({
      execAsync: mock.fn(async () => {
        throw new Error('claude not found');
      }),
      readKey: initReadKey({ ides: ['claude'] }),
    });
    await runDisable(deps);

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Failed to remove Claude Code plugin'));
    assert.ok(output.includes('Spark has been disabled'));
  });

  it('continues when skills removal fails', async () => {
    const deps = makeDeps({
      spawnInteractive: mock.fn(async () => {
        throw new Error('npx exited with code 1');
      }),
      readKey: initReadKey({ ides: ['other'] }),
    });
    await runDisable(deps);

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Failed to remove skills'));
    assert.ok(output.includes('Spark has been disabled'));
  });

  it('does not call execAsync when ides does not include claude', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['other'] }) });
    await runDisable(deps);

    assert.strictEqual(deps.execAsync.mock.calls.length, 0);
  });

  it('does not call spawnInteractive when ides does not include other', async () => {
    const deps = makeDeps({ readKey: initReadKey({ ides: ['claude'] }) });
    await runDisable(deps);

    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 0);
  });

  it('uses stored variant instead of calling detect', async () => {
    const deps = makeDeps({
      readKey: initReadKey({ ides: ['claude'], variant: 'teams' }),
      detect: mock.fn(async () => {
        throw new Error('should not be called');
      }),
    });
    await runDisable(deps);

    assert.strictEqual(deps.detect.mock.calls.length, 0);
    const [, args] = deps.execAsync.mock.calls[0].arguments;
    assert.ok(args.includes(VARIANTS.teams.claudePlugin));
  });

  it('errors when detect throws and no stored variant exists', async () => {
    const deps = makeDeps({
      readKey: initReadKey({ ides: ['claude'] }),
      detect: mock.fn(async () => {
        throw new Error('401 Unauthorized');
      }),
    });
    await runDisable(deps);

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Could not detect variant'));
    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
  });
});
