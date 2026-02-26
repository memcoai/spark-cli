import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runEnable } from '../../src/commands/enable.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput } from '../helpers.js';

describe('runEnable', () => {
  const mocks = setupCommandMocks();

  const defaultDeps = (overrides = {}) => ({
    promptChecklist: mock.fn(async () => ['Claude Code']),
    exec: mock.fn(async () => ({ stdout: '', stderr: '' })),
    spawnInteractive: mock.fn(async () => {}),
    fetchVersion: mock.fn(async () => ({ version: '1.0.0' })),
    ...overrides,
  });

  it('shows warning when no IDE is selected', async () => {
    await runEnable(defaultDeps({ promptChecklist: mock.fn(async () => []) }));

    assert.ok(getLogOutput(mocks.logMock).includes('No IDE selected'));
  });

  it('prints cancellation message on user cancel', async () => {
    await runEnable(
      defaultDeps({
        promptChecklist: mock.fn(async () => {
          throw new Error('User cancelled');
        }),
      }),
    );

    assert.ok(getLogOutput(mocks.logMock).includes('Setup cancelled'));
  });

  it('runs Claude Code setup with project scope', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    await runEnable(defaultDeps({ exec }));

    assert.strictEqual(exec.mock.calls.length, 2);

    // First call: marketplace add
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'claude');
    assert.deepStrictEqual(exec.mock.calls[0].arguments[1], [
      'plugin',
      'marketplace',
      'add',
      'memcoai/marketplace',
    ]);

    // Second call: plugin install — always project scope
    assert.strictEqual(exec.mock.calls[1].arguments[0], 'claude');
    assert.deepStrictEqual(exec.mock.calls[1].arguments[1], [
      'plugin',
      'install',
      'spark-cli@MemCo',
      '--scope',
      'project',
    ]);
  });

  it('runs Other IDEs setup without --global flag', async () => {
    const spawnInteractive = mock.fn(async () => {});
    await runEnable(
      defaultDeps({
        promptChecklist: mock.fn(async () => ['Other (Cursor, Windsurf, etc.)']),
        spawnInteractive,
      }),
    );

    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
    assert.strictEqual(spawnInteractive.mock.calls[0].arguments[0], 'npx');
    assert.deepStrictEqual(spawnInteractive.mock.calls[0].arguments[1], [
      'skills',
      'add',
      'memcoai/spark-cli-skills',
    ]);
  });

  it('runs both IDE setups when both selected', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const spawnInteractive = mock.fn(async () => {});
    await runEnable(
      defaultDeps({
        promptChecklist: mock.fn(async () => ['Claude Code', 'Other (Cursor, Windsurf, etc.)']),
        exec,
        spawnInteractive,
      }),
    );

    assert.strictEqual(exec.mock.calls.length, 2);
    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
  });

  it('prints auth instructions after successful setup', async () => {
    await runEnable(defaultDeps());

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Next: Authenticate with Spark'));
    assert.ok(output.includes('spark login'));
    assert.ok(output.includes('spark status'));
  });

  it('treats marketplace already-exists error as success', async () => {
    let callCount = 0;
    const exec = mock.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw Object.assign(new Error('already exists'), {
          stderr: 'Marketplace already exists',
        });
      }
      return { stdout: '', stderr: '' };
    });

    await runEnable(defaultDeps({ exec }));

    const output = getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('already configured'));
    assert.strictEqual(exec.mock.calls.length, 2);
  });

  it('continues with warning when a command fails', async () => {
    await runEnable(
      defaultDeps({
        exec: mock.fn(async () => {
          throw Object.assign(new Error('command not found'), { stderr: 'claude: not found' });
        }),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Next: Authenticate with Spark'));
  });
});
