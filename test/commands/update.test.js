import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runUpdate, updateSkills } from '../../src/commands/update.js';
import { VARIANTS } from '../../src/constants.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput, npmExecErrorCases } from '../helpers.js';

const defaultRunDeps = (overrides = {}) => ({
  exec: mock.fn(() => ''),
  getVersion: mock.fn(() => '1.0.0'),
  skills: mock.fn(async () => {}),
  ...overrides,
});

const defaultSkillsDeps = (overrides = {}) => ({
  getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' })),
  exec: mock.fn(async () => ({ stdout: '', stderr: '' })),
  spawnInteractive: mock.fn(async () => {}),
  fetchVersion: mock.fn(async () => ({ version: '1.1.0' })),
  writeKey: mock.fn(),
  readKey: mock.fn(() => null),
  detect: mock.fn(async () => VARIANTS.public),
  ensureVariant: mock.fn(async () => null),
  ...overrides,
});

describe('updateCommand', () => {
  const mocks = setupCommandMocks();

  it('shows already on latest when version is unchanged', async () => {
    await runUpdate(defaultRunDeps());

    const output = getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Already on the latest version (v1.0.0)'));
  });

  it('shows updated message when version changes', async () => {
    let callCount = 0;
    const deps = defaultRunDeps({
      getVersion: mock.fn(() => {
        callCount++;
        return callCount === 1 ? '1.0.0' : '1.1.0';
      }),
    });

    await runUpdate(deps);

    const output = getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Updated @memco/spark: v1.0.0'));
    assert.ok(output.includes('v1.1.0'));
  });

  it('calls npm install with correct command and options', async () => {
    const deps = defaultRunDeps();

    await runUpdate(deps);

    assert.strictEqual(deps.exec.mock.calls.length, 1);
    assert.strictEqual(deps.exec.mock.calls[0].arguments[0], 'npm install -g @memco/spark@latest');
    const opts = deps.exec.mock.calls[0].arguments[1];
    assert.strictEqual(opts.encoding, 'utf8');
    assert.strictEqual(opts.timeout, 60000);
  });

  for (const { name, error, expected } of npmExecErrorCases) {
    it(name, async () => {
      const deps = defaultRunDeps({
        exec: mock.fn(() => {
          throw error;
        }),
      });

      await runUpdate(deps);

      assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);
      assert.ok(getLogOutput(mocks.logMock).includes(expected));
    });
  }

  it('prints current version before updating', async () => {
    await runUpdate(defaultRunDeps({ getVersion: mock.fn(() => '2.3.4') }));

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Current version: v2.3.4'));
  });

  it('does not call getVersion a second time on failure', async () => {
    const deps = defaultRunDeps({
      exec: mock.fn(() => {
        throw new Error('fail');
      }),
    });

    await runUpdate(deps);

    assert.strictEqual(deps.getVersion.mock.calls.length, 1);
  });

  it('calls skills update after successful CLI update', async () => {
    const deps = defaultRunDeps();

    await runUpdate(deps);

    assert.strictEqual(deps.skills.mock.calls.length, 1);
  });

  it('does not call skills update on CLI update failure', async () => {
    const deps = defaultRunDeps({
      exec: mock.fn(() => {
        throw new Error('fail');
      }),
    });

    await runUpdate(deps);

    assert.strictEqual(deps.skills.mock.calls.length, 0);
  });
});

describe('updateSkills', () => {
  const mocks = setupCommandMocks();

  it('skips when no init data exists', async () => {
    const deps = defaultSkillsDeps({ getInit: mock.fn(() => null) });

    await updateSkills(deps);

    assert.strictEqual(deps.exec.mock.calls.length, 0);
  });

  it('skips when init data has no IDEs', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: [], skillsVersion: '1.0.0' })),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.exec.mock.calls.length, 0);
  });

  it('updates Claude Code plugin when claude IDE is configured', async () => {
    const deps = defaultSkillsDeps();

    await updateSkills(deps);

    assert.strictEqual(deps.exec.mock.calls.length, 1);
    assert.deepStrictEqual(deps.exec.mock.calls[0].arguments[0], 'claude');
    assert.deepStrictEqual(deps.exec.mock.calls[0].arguments[1], [
      'plugin',
      'update',
      VARIANTS.public.claudePlugin,
    ]);
  });

  it('updates Codex plugin via marketplace upgrade when codex IDE is configured', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['codex'], skillsVersion: '1.0.0' })),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.exec.mock.calls.length, 1);
    assert.deepStrictEqual(deps.exec.mock.calls[0].arguments[0], 'codex');
    assert.deepStrictEqual(deps.exec.mock.calls[0].arguments[1], [
      'plugin',
      'marketplace',
      'upgrade',
      'MemCo',
    ]);
  });

  it('updates other IDE skills when other IDE is configured', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['other'], skillsVersion: '1.0.0' })),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 1);
    assert.deepStrictEqual(deps.spawnInteractive.mock.calls[0].arguments[0], 'npx');
    assert.deepStrictEqual(deps.spawnInteractive.mock.calls[0].arguments[1], [
      'skills',
      'update',
      VARIANTS.public.skillsRepo,
    ]);
  });

  it('updates both IDEs when both are configured', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['claude', 'other'], skillsVersion: '1.0.0' })),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.exec.mock.calls.length, 1);
    assert.strictEqual(deps.spawnInteractive.mock.calls.length, 1);
  });

  it('continues when Claude Code update fails', async () => {
    const deps = defaultSkillsDeps({
      exec: mock.fn(async () => {
        throw new Error('claude not found');
      }),
    });

    await updateSkills(deps);

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('claude not found'));
  });

  it('continues when other IDE update fails', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['other'], skillsVersion: '1.0.0' })),
      spawnInteractive: mock.fn(async () => {
        throw new Error('npx not found');
      }),
    });

    await updateSkills(deps);

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('npx not found'));
  });

  it('does not update stored skills version when Claude Code update fails', async () => {
    const deps = defaultSkillsDeps({
      exec: mock.fn(async () => {
        throw new Error('claude not found');
      }),
      fetchVersion: mock.fn(async () => ({ version: '1.2.0' })),
      readKey: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' })),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.fetchVersion.mock.calls.length, 0);
    assert.strictEqual(deps.writeKey.mock.calls.length, 0);
  });

  it('does not update stored skills version when Codex update fails', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['codex'], skillsVersion: '1.0.0' })),
      exec: mock.fn(async () => {
        throw new Error('codex not found');
      }),
      fetchVersion: mock.fn(async () => ({ version: '1.2.0' })),
      readKey: mock.fn(() => ({ ides: ['codex'], skillsVersion: '1.0.0' })),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.fetchVersion.mock.calls.length, 0);
    assert.strictEqual(deps.writeKey.mock.calls.length, 0);
    assert.ok(getLogOutput(mocks.logMock).includes('codex not found'));
  });

  it('does not update stored skills version when other IDE update fails', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['other'], skillsVersion: '1.0.0' })),
      spawnInteractive: mock.fn(async () => {
        throw new Error('npx not found');
      }),
      fetchVersion: mock.fn(async () => ({ version: '1.2.0' })),
      readKey: mock.fn(() => ({ ides: ['other'], skillsVersion: '1.0.0' })),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.fetchVersion.mock.calls.length, 0);
    assert.strictEqual(deps.writeKey.mock.calls.length, 0);
  });

  it('does not update stored skills version when any IDE update fails', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['claude', 'other'], skillsVersion: '1.0.0' })),
      spawnInteractive: mock.fn(async () => {
        throw new Error('npx not found');
      }),
      fetchVersion: mock.fn(async () => ({ version: '1.2.0' })),
      readKey: mock.fn(() => ({ ides: ['claude', 'other'], skillsVersion: '1.0.0' })),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.fetchVersion.mock.calls.length, 0);
    assert.strictEqual(deps.writeKey.mock.calls.length, 0);
  });

  it('uses stored variant from init data when ensureVariant returns null', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'teams' })),
      ensureVariant: mock.fn(async () => null),
      detect: mock.fn(async () => {
        throw new Error('should not be called');
      }),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.detect.mock.calls.length, 0);
    assert.deepStrictEqual(deps.exec.mock.calls[0].arguments[1], [
      'plugin',
      'update',
      VARIANTS.teams.claudePlugin,
    ]);
  });

  it('falls back to detectVariant when no stored variant exists', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' })),
      ensureVariant: mock.fn(async () => null),
      detect: mock.fn(async () => VARIANTS.teams),
    });

    await updateSkills(deps);

    assert.strictEqual(deps.detect.mock.calls.length, 1);
    assert.deepStrictEqual(deps.exec.mock.calls[0].arguments[1], [
      'plugin',
      'update',
      VARIANTS.teams.claudePlugin,
    ]);
  });

  it('shows error when detectVariant throws and no stored variant exists', async () => {
    const deps = defaultSkillsDeps({
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' })),
      ensureVariant: mock.fn(async () => null),
      detect: mock.fn(async () => {
        throw new Error('401 Unauthorized');
      }),
    });

    await updateSkills(deps);

    const output = getLogOutput(mocks.logMock) + getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Could not detect variant'));
    assert.strictEqual(deps.exec.mock.calls.length, 0);
  });

  it('updates skills version in local settings when local init exists', async () => {
    const localInit = { ides: ['claude'], skillsVersion: '1.0.0' };
    const deps = defaultSkillsDeps({
      fetchVersion: mock.fn(async () => ({ version: '1.2.0' })),
      readKey: mock.fn((path) => {
        if (path.includes('.spark/settings.json') && !path.includes('~')) return localInit;
        return null;
      }),
    });

    await updateSkills(deps);

    const localWrite = deps.writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'init' && c.arguments[2]?.skillsVersion === '1.2.0',
    );
    assert.ok(localWrite, 'should write updated skills version to local init');
  });

  it('updates skills version in global settings when globalInit exists', async () => {
    const globalInit = { ides: ['claude'], skillsVersion: '1.0.0' };
    const deps = defaultSkillsDeps({
      fetchVersion: mock.fn(async () => ({ version: '1.2.0' })),
      readKey: mock.fn((path, key) => {
        if (key === 'globalInit') return globalInit;
        return null;
      }),
    });

    await updateSkills(deps);

    const globalWrite = deps.writeKey.mock.calls.find(
      (c) => c.arguments[1] === 'globalInit' && c.arguments[2]?.skillsVersion === '1.2.0',
    );
    assert.ok(globalWrite, 'should write updated skills version to globalInit');
  });
});
