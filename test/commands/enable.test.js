import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runEnable } from '../../src/commands/enable.js';
import { setupCommandMocks } from '../helpers.js';

// Shared setup flow behavior (IDE selection, cancel handling, error resilience,
// auth instructions) is tested via runInit in init.test.js since both use runSetupFlow.
// These tests verify only what's unique to enable: scope is always 'project'.

describe('runEnable', () => {
  setupCommandMocks();

  const defaultDeps = (overrides = {}) => ({
    promptChecklist: mock.fn(async () => ['Claude Code']),
    exec: mock.fn(async () => ({ stdout: '', stderr: '' })),
    spawnInteractive: mock.fn(async () => {}),
    fetchVersion: mock.fn(async () => ({ version: '1.0.0' })),
    ...overrides,
  });

  it('always uses project scope for Claude Code setup', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    await runEnable(defaultDeps({ exec }));

    assert.deepStrictEqual(exec.mock.calls[1].arguments[1], [
      'plugin',
      'install',
      'spark-cli@MemCo',
      '--scope',
      'project',
    ]);
  });

  it('always uses project scope for Other IDEs setup', async () => {
    const spawnInteractive = mock.fn(async () => {});
    await runEnable(
      defaultDeps({
        promptChecklist: mock.fn(async () => ['Other (Cursor, Windsurf, etc.)']),
        spawnInteractive,
      }),
    );

    const args = spawnInteractive.mock.calls[0].arguments[1];
    assert.deepStrictEqual(args, ['skills', 'add', 'memcoai/spark-cli-skills']);
    assert.ok(!args.includes('--global'));
  });

  it('does not prompt for scope selection', async () => {
    const promptChoice = mock.fn(async () => {
      throw new Error('should not be called');
    });
    await runEnable(defaultDeps({ promptChoice }));

    assert.strictEqual(promptChoice.mock.calls.length, 0);
  });
});
