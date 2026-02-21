import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runInit } from '../../src/commands/init.js';
import { setupCommandMocks } from '../helpers.js';

describe('runInit', () => {
  const mocks = setupCommandMocks();
  let stdoutMock;

  beforeEach(() => {
    stdoutMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    stdoutMock.mock.restore();
  });

  const getLogOutput = (m) => m.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
  const getStdoutOutput = (m) => m.mock.calls.map((c) => c.arguments[0]).join('');

  it('shows warning when no IDE is selected', async () => {
    await runInit({
      prompt_checklist: mock.fn(async () => []),
      prompt_choice: mock.fn(async () => 'This project (current directory)'),
    });

    assert.ok(getLogOutput(mocks.logMock).includes('No IDE selected'));
  });

  it('prints cancellation message on user cancel during IDE selection', async () => {
    await runInit({
      prompt_checklist: mock.fn(async () => {
        throw new Error('User cancelled');
      }),
      prompt_choice: mock.fn(async () => 'This project (current directory)'),
    });

    assert.ok(getLogOutput(mocks.logMock).includes('Setup cancelled'));
  });

  it('runs Claude Code setup with project scope', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));

    await runInit({
      prompt_checklist: mock.fn(async () => ['Claude Code']),
      prompt_choice: mock.fn(async () => 'This project (current directory)'),
      exec,
    });

    assert.strictEqual(exec.mock.calls.length, 2);

    // First call: marketplace add
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'claude');
    assert.deepStrictEqual(exec.mock.calls[0].arguments[1], [
      'plugin',
      'marketplace',
      'add',
      'memcoai/marketplace',
    ]);

    // Second call: plugin install with project scope
    assert.strictEqual(exec.mock.calls[1].arguments[0], 'claude');
    assert.deepStrictEqual(exec.mock.calls[1].arguments[1], [
      'plugin',
      'install',
      'spark-cli@MemCo',
      '--scope',
      'project',
    ]);
  });

  it('runs Claude Code setup with global (user) scope', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));

    await runInit({
      prompt_checklist: mock.fn(async () => ['Claude Code']),
      prompt_choice: mock.fn(async () => 'Global (all projects)'),
      exec,
    });

    assert.deepStrictEqual(exec.mock.calls[1].arguments[1], [
      'plugin',
      'install',
      'spark-cli@MemCo',
      '--scope',
      'user',
    ]);
  });

  it('runs Other IDEs setup with project scope via interactive spawn', async () => {
    const spawnInteractive = mock.fn(async () => {});

    await runInit({
      prompt_checklist: mock.fn(async () => ['Other (Cursor, Windsurf, etc.)']),
      prompt_choice: mock.fn(async () => 'This project (current directory)'),
      spawn_interactive: spawnInteractive,
    });

    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
    assert.strictEqual(spawnInteractive.mock.calls[0].arguments[0], 'npx');
    assert.deepStrictEqual(spawnInteractive.mock.calls[0].arguments[1], [
      'skills',
      'add',
      'memcoai/spark-cli-skills',
    ]);
  });

  it('runs Other IDEs setup with global scope via interactive spawn', async () => {
    const spawnInteractive = mock.fn(async () => {});

    await runInit({
      prompt_checklist: mock.fn(async () => ['Other (Cursor, Windsurf, etc.)']),
      prompt_choice: mock.fn(async () => 'Global (all projects)'),
      spawn_interactive: spawnInteractive,
    });

    assert.deepStrictEqual(spawnInteractive.mock.calls[0].arguments[1], [
      'skills',
      'add',
      'memcoai/spark-cli-skills',
      '--global',
    ]);
  });

  it('runs both IDE setups when both selected', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const spawnInteractive = mock.fn(async () => {});

    await runInit({
      prompt_checklist: mock.fn(async () => [
        'Claude Code',
        'Other (Cursor, Windsurf, etc.)',
      ]),
      prompt_choice: mock.fn(async () => 'This project (current directory)'),
      exec,
      spawn_interactive: spawnInteractive,
    });

    // Claude Code: 2 exec calls (marketplace + install)
    assert.strictEqual(exec.mock.calls.length, 2);
    // Other: 1 interactive spawn call (npx skills)
    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
  });

  it('prints auth instructions after successful setup', async () => {
    await runInit({
      prompt_checklist: mock.fn(async () => ['Claude Code']),
      prompt_choice: mock.fn(async () => 'This project (current directory)'),
      exec: mock.fn(async () => ({ stdout: '', stderr: '' })),
    });

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

    await runInit({
      prompt_checklist: mock.fn(async () => ['Claude Code']),
      prompt_choice: mock.fn(async () => 'This project (current directory)'),
      exec,
    });

    const output = getStdoutOutput(stdoutMock);
    // Should show success-style message, not a failure
    assert.ok(output.includes('already configured'));
    // Should still proceed to install the plugin
    assert.strictEqual(exec.mock.calls.length, 2);
  });

  it('shows warning when Other IDEs interactive spawn fails', async () => {
    const spawnInteractive = mock.fn(async () => {
      throw new Error('npx exited with code 1');
    });

    await runInit({
      prompt_checklist: mock.fn(async () => ['Other (Cursor, Windsurf, etc.)']),
      prompt_choice: mock.fn(async () => 'This project (current directory)'),
      spawn_interactive: spawnInteractive,
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Failed to install skills'));
    assert.ok(output.includes('You can install manually'));
    // Should still show auth instructions
    assert.ok(output.includes('Next: Authenticate with Spark'));
  });

  it('continues with warning when a command fails', async () => {
    const exec = mock.fn(async () => {
      throw Object.assign(new Error('command not found'), { stderr: 'claude: not found' });
    });

    await runInit({
      prompt_checklist: mock.fn(async () => ['Claude Code']),
      prompt_choice: mock.fn(async () => 'This project (current directory)'),
      exec,
    });

    const output = getLogOutput(mocks.logMock);
    // Should still show auth instructions even after failures
    assert.ok(output.includes('Next: Authenticate with Spark'));
  });
});
