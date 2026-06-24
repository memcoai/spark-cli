import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runSetupFlow, saveInitChoices } from '../../src/commands/init.js';
import { VARIANTS, SETTINGS_PATH, LOCAL_SETTINGS_PATH } from '../../src/constants.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput, buildSetupDeps } from '../helpers.js';

const MARKETPLACE_ADD = ['plugin', 'marketplace', 'add', 'memcoai/marketplace'];

// An exec mock whose first call (marketplace add) fails as "already exists", then succeeds.
const alreadyExistsThenSucceed = () => {
  let callCount = 0;
  return mock.fn(async () => {
    callCount += 1;
    if (callCount === 1) {
      throw Object.assign(new Error('already exists'), { stderr: 'Marketplace already exists' });
    }
    return { stdout: '', stderr: '' };
  });
};

describe('runSetupFlow', () => {
  const mocks = setupCommandMocks();

  const defaultDeps = (overrides = {}) =>
    buildSetupDeps({
      promptChecklist: mock.fn(async () => ['Claude Code']),
      promptChoice: mock.fn(async () => 'This project (current directory)'),
      detect: mock.fn(async () => VARIANTS.public),
      ensureVariant: mock.fn(async () => null),
      fetchManifest: mock.fn(async () => ({ tools: [], checkedAt: 0, apiBase: '' })),
      ...overrides,
    });

  it('shows warning when no IDE is selected', async () => {
    await runSetupFlow(defaultDeps({ promptChecklist: mock.fn(async () => []) }));

    assert.ok(getLogOutput(mocks.logMock).includes('No IDE selected'));
  });

  it('prints cancellation message on user cancel during IDE selection', async () => {
    await runSetupFlow(
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
    await runSetupFlow(defaultDeps({ exec }));

    assert.strictEqual(exec.mock.calls.length, 2);

    // First call: marketplace add
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'claude');
    assert.deepStrictEqual(exec.mock.calls[0].arguments[1], MARKETPLACE_ADD);

    // Second call: plugin install with project scope
    assert.strictEqual(exec.mock.calls[1].arguments[0], 'claude');
    assert.deepStrictEqual(exec.mock.calls[1].arguments[1], [
      'plugin',
      'install',
      VARIANTS.public.claudePlugin,
      '--scope',
      'project',
    ]);
  });

  it('runs Claude Code setup with global (user) scope', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    await runSetupFlow(
      defaultDeps({
        exec,
        promptChoice: mock.fn(async () => 'Global (all projects)'),
      }),
    );

    assert.deepStrictEqual(exec.mock.calls[1].arguments[1], [
      'plugin',
      'install',
      VARIANTS.public.claudePlugin,
      '--scope',
      'user',
    ]);
  });

  it('runs Codex setup (marketplace add + plugin add, no scope)', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    await runSetupFlow(defaultDeps({ exec, promptChecklist: mock.fn(async () => ['Codex']) }));

    assert.strictEqual(exec.mock.calls.length, 2);

    // First call: marketplace add
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'codex');
    assert.deepStrictEqual(exec.mock.calls[0].arguments[1], MARKETPLACE_ADD);

    // Second call: plugin add — Codex plugins are global, so no --scope flag
    assert.strictEqual(exec.mock.calls[1].arguments[0], 'codex');
    assert.deepStrictEqual(exec.mock.calls[1].arguments[1], [
      'plugin',
      'add',
      VARIANTS.public.claudePlugin,
    ]);
  });

  it('installs teams plugin for Codex when variant is teams', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    await runSetupFlow(
      defaultDeps({
        exec,
        promptChecklist: mock.fn(async () => ['Codex']),
        detect: mock.fn(async () => VARIANTS.teams),
      }),
    );

    assert.deepStrictEqual(exec.mock.calls[1].arguments[1], [
      'plugin',
      'add',
      VARIANTS.teams.claudePlugin,
    ]);
  });

  it('notes Codex is global-only when project scope is chosen', async () => {
    await runSetupFlow(defaultDeps({ promptChecklist: mock.fn(async () => ['Codex']) }));

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Codex plugins are installed globally'));
  });

  it('does not print the Codex global-only note for global scope', async () => {
    await runSetupFlow(
      defaultDeps({
        promptChecklist: mock.fn(async () => ['Codex']),
        promptChoice: mock.fn(async () => 'Global (all projects)'),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(!output.includes('the project scope does not apply'));
  });

  it('treats Codex marketplace already-exists error as success', async () => {
    const exec = alreadyExistsThenSucceed();

    await runSetupFlow(defaultDeps({ exec, promptChecklist: mock.fn(async () => ['Codex']) }));

    const output = getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('already configured'));
    // Should still proceed to install the plugin
    assert.strictEqual(exec.mock.calls.length, 2);
  });

  it('shows manual Codex fallback commands when setup fails', async () => {
    await runSetupFlow(
      defaultDeps({
        promptChecklist: mock.fn(async () => ['Codex']),
        exec: mock.fn(async () => {
          throw Object.assign(new Error('command not found'), { stderr: 'codex: not found' });
        }),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('codex plugin marketplace add memcoai/marketplace'));
    assert.ok(output.includes('codex plugin add'));
    // Should still show auth instructions even after failures
    assert.ok(output.includes('Next: Authenticate with Spark'));
  });

  it('runs Other IDEs setup with project scope via interactive spawn', async () => {
    const spawnInteractive = mock.fn(async () => {});
    await runSetupFlow(
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
      VARIANTS.public.skillsRepo,
    ]);
  });

  it('runs Other IDEs setup with global scope via interactive spawn', async () => {
    const spawnInteractive = mock.fn(async () => {});
    await runSetupFlow(
      defaultDeps({
        promptChecklist: mock.fn(async () => ['Other (Cursor, Windsurf, etc.)']),
        promptChoice: mock.fn(async () => 'Global (all projects)'),
        spawnInteractive,
      }),
    );

    assert.deepStrictEqual(spawnInteractive.mock.calls[0].arguments[1], [
      'skills',
      'add',
      VARIANTS.public.skillsRepo,
      '--global',
    ]);
  });

  it('runs both IDE setups when both selected', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const spawnInteractive = mock.fn(async () => {});
    await runSetupFlow(
      defaultDeps({
        promptChecklist: mock.fn(async () => ['Claude Code', 'Other (Cursor, Windsurf, etc.)']),
        exec,
        spawnInteractive,
      }),
    );

    // Claude Code: 2 exec calls (marketplace + install)
    assert.strictEqual(exec.mock.calls.length, 2);
    // Other: 1 interactive spawn call (npx skills)
    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
  });

  it('prints auth instructions after successful setup', async () => {
    await runSetupFlow(defaultDeps());

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Next: Authenticate with Spark'));
    assert.ok(output.includes('spark login'));
    assert.ok(output.includes('spark status'));
  });

  it('treats marketplace already-exists error as success', async () => {
    const exec = alreadyExistsThenSucceed();

    await runSetupFlow(defaultDeps({ exec }));

    const output = getStdoutOutput(mocks.stdoutMock);
    // Should show success-style message, not a failure
    assert.ok(output.includes('already configured'));
    // Should still proceed to install the plugin
    assert.strictEqual(exec.mock.calls.length, 2);
  });

  it('shows warning when Other IDEs interactive spawn fails', async () => {
    await runSetupFlow(
      defaultDeps({
        promptChecklist: mock.fn(async () => ['Other (Cursor, Windsurf, etc.)']),
        spawnInteractive: mock.fn(async () => {
          throw new Error('npx exited with code 1');
        }),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Failed to install skills'));
    assert.ok(output.includes('You can install manually'));
    // Should still show auth instructions
    assert.ok(output.includes('Next: Authenticate with Spark'));
  });

  it('continues with warning when a command fails', async () => {
    await runSetupFlow(
      defaultDeps({
        exec: mock.fn(async () => {
          throw Object.assign(new Error('command not found'), { stderr: 'claude: not found' });
        }),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    // Should still show auth instructions even after failures
    assert.ok(output.includes('Next: Authenticate with Spark'));
  });

  it('installs teams plugin when variant is teams', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    await runSetupFlow(
      defaultDeps({
        exec,
        detect: mock.fn(async () => VARIANTS.teams),
      }),
    );

    // Plugin install should use teams plugin name
    assert.deepStrictEqual(exec.mock.calls[1].arguments[1], [
      'plugin',
      'install',
      VARIANTS.teams.claudePlugin,
      '--scope',
      'project',
    ]);
  });

  it('installs teams skills when variant is teams for Other IDEs', async () => {
    const spawnInteractive = mock.fn(async () => {});
    await runSetupFlow(
      defaultDeps({
        promptChecklist: mock.fn(async () => ['Other (Cursor, Windsurf, etc.)']),
        spawnInteractive,
        detect: mock.fn(async () => VARIANTS.teams),
      }),
    );

    assert.deepStrictEqual(spawnInteractive.mock.calls[0].arguments[1], [
      'skills',
      'add',
      VARIANTS.teams.skillsRepo,
    ]);
  });

  it('populates the tool manifest cache after successful setup', async () => {
    const fetchManifest = mock.fn(async () => ({ tools: [], checkedAt: 0, apiBase: '' }));
    await runSetupFlow(defaultDeps({ fetchManifest }));

    assert.strictEqual(fetchManifest.mock.calls.length, 1);
  });

  it('does not abort init when the tool manifest fetch fails (fail-open)', async () => {
    const fetchManifest = mock.fn(async () => {
      throw new Error('network down');
    });
    await runSetupFlow(defaultDeps({ fetchManifest }));

    // Manifest fetch was attempted but the failure was swallowed — setup still completes.
    assert.strictEqual(fetchManifest.mock.calls.length, 1);
    assert.ok(getLogOutput(mocks.logMock).includes('Next: Authenticate with Spark'));
  });
});

describe('saveInitChoices — Codex is tracked globally only', () => {
  const baseDeps = (overrides = {}) => ({
    fetchVersion: mock.fn(async () => ({ version: '1.0.0' })),
    writeKey: mock.fn(),
    readKey: mock.fn(() => null),
    variant: VARIANTS.public,
    ...overrides,
  });

  const writesOf = (deps) => deps.writeKey.mock.calls.map((c) => c.arguments);

  it('records Codex in globalInit (not local init) under project scope', async () => {
    const deps = baseDeps();
    await saveInitChoices(['Codex'], 'project', deps);

    const writes = writesOf(deps);
    // Codex-only project install writes nothing project-scoped (no local init, no projects entry)
    assert.ok(!writes.some(([path]) => path === LOCAL_SETTINGS_PATH));
    assert.ok(!writes.some(([path, key]) => path === SETTINGS_PATH && key === 'projects'));
    const globalWrite = writes.find(
      ([path, key]) => path === SETTINGS_PATH && key === 'globalInit',
    );
    assert.ok(globalWrite, 'should write globalInit');
    assert.deepStrictEqual(globalWrite[2].ides, ['codex']);
  });

  it('splits Codex (global) from Claude (project) under project scope', async () => {
    const deps = baseDeps();
    await saveInitChoices(['Claude Code', 'Codex'], 'project', deps);

    const writes = writesOf(deps);
    const localWrite = writes.find(([path, key]) => path === LOCAL_SETTINGS_PATH && key === 'init');
    assert.deepStrictEqual(localWrite[2].ides, ['claude']);
    const projectsWrite = writes.find(
      ([path, key]) => path === SETTINGS_PATH && key === 'projects',
    );
    assert.deepStrictEqual(projectsWrite[2][0].ides, ['claude']);
    const globalWrite = writes.find(
      ([path, key]) => path === SETTINGS_PATH && key === 'globalInit',
    );
    assert.deepStrictEqual(globalWrite[2].ides, ['codex']);
  });

  it('merges Codex into an existing globalInit record', async () => {
    const deps = baseDeps({
      readKey: mock.fn((path, key) =>
        key === 'globalInit'
          ? { ides: ['claude'], skillsVersion: '0.9.0', variant: 'public' }
          : null,
      ),
    });
    await saveInitChoices(['Codex'], 'project', deps);

    const globalWrite = writesOf(deps).find(
      ([path, key]) => path === SETTINGS_PATH && key === 'globalInit',
    );
    assert.deepStrictEqual(
      [...globalWrite[2].ides].sort((a, b) => a.localeCompare(b)),
      ['claude', 'codex'],
    );
  });

  it('writes everything to globalInit under global scope', async () => {
    const deps = baseDeps();
    await saveInitChoices(['Claude Code', 'Codex'], 'global', deps);

    const writes = writesOf(deps);
    assert.ok(!writes.some(([path]) => path === LOCAL_SETTINGS_PATH));
    const globalWrite = writes.find(
      ([path, key]) => path === SETTINGS_PATH && key === 'globalInit',
    );
    assert.deepStrictEqual(globalWrite[2].ides, ['claude', 'codex']);
  });
});
