import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runUpdate, updateSkills } from '../../src/commands/update.js';
import { setupCommandMocks, getLogOutput, getStdoutOutput, npmExecErrorCases } from '../helpers.js';

describe('updateCommand', () => {
  const mocks = setupCommandMocks();

  it('shows already on latest when version is unchanged', async () => {
    const exec = mock.fn(() => '');
    const getVersion = mock.fn(() => '1.0.0');
    const skills = mock.fn(async () => {});

    await runUpdate({ exec, getVersion, skills });

    const output = getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Already on the latest version (v1.0.0)'));
  });

  it('shows updated message when version changes', async () => {
    const exec = mock.fn(() => '');
    let callCount = 0;
    const getVersion = mock.fn(() => {
      callCount++;
      return callCount === 1 ? '1.0.0' : '1.1.0';
    });
    const skills = mock.fn(async () => {});

    await runUpdate({ exec, getVersion, skills });

    const output = getStdoutOutput(mocks.stdoutMock);
    assert.ok(output.includes('Updated @memco/spark: v1.0.0'));
    assert.ok(output.includes('v1.1.0'));
  });

  it('calls npm install with correct command and options', async () => {
    const exec = mock.fn(() => '');
    const getVersion = mock.fn(() => '1.0.0');
    const skills = mock.fn(async () => {});

    await runUpdate({ exec, getVersion, skills });

    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(exec.mock.calls[0].arguments[0], 'npm install -g @memco/spark@latest');
    const opts = exec.mock.calls[0].arguments[1];
    assert.strictEqual(opts.encoding, 'utf8');
    assert.strictEqual(opts.timeout, 60000);
  });

  for (const { name, error, expected } of npmExecErrorCases) {
    it(name, async () => {
      const exec = mock.fn(() => {
        throw error;
      });
      const getVersion = mock.fn(() => '1.0.0');
      const skills = mock.fn(async () => {});

      await runUpdate({ exec, getVersion, skills });

      assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);
      assert.ok(getLogOutput(mocks.logMock).includes(expected));
    });
  }

  it('prints current version before updating', async () => {
    const exec = mock.fn(() => '');
    const getVersion = mock.fn(() => '2.3.4');
    const skills = mock.fn(async () => {});

    await runUpdate({ exec, getVersion, skills });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Current version: v2.3.4'));
  });

  it('does not call getVersion a second time on failure', async () => {
    const exec = mock.fn(() => {
      throw new Error('fail');
    });
    const getVersion = mock.fn(() => '1.0.0');
    const skills = mock.fn(async () => {});

    await runUpdate({ exec, getVersion, skills });

    assert.strictEqual(getVersion.mock.calls.length, 1);
  });

  it('calls skills update after successful CLI update', async () => {
    const exec = mock.fn(() => '');
    const getVersion = mock.fn(() => '1.0.0');
    const skills = mock.fn(async () => {});

    await runUpdate({ exec, getVersion, skills });

    assert.strictEqual(skills.mock.calls.length, 1);
  });

  it('does not call skills update on CLI update failure', async () => {
    const exec = mock.fn(() => {
      throw new Error('fail');
    });
    const getVersion = mock.fn(() => '1.0.0');
    const skills = mock.fn(async () => {});

    await runUpdate({ exec, getVersion, skills });

    assert.strictEqual(skills.mock.calls.length, 0);
  });
});

describe('updateSkills', () => {
  const mocks = setupCommandMocks();

  it('skips when no init data exists', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const getInit = mock.fn(() => null);

    await updateSkills({ getInit, exec });

    assert.strictEqual(exec.mock.calls.length, 0);
  });

  it('skips when init data has no IDEs', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const getInit = mock.fn(() => ({ ides: [], skillsVersion: '1.0.0' }));

    await updateSkills({ getInit, exec });

    assert.strictEqual(exec.mock.calls.length, 0);
  });

  it('updates Claude Code plugin when claude IDE is configured', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const getInit = mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' }));
    const fetchVersion = mock.fn(async () => ({ version: '1.1.0' }));
    const writeKey = mock.fn();
    const readKey = mock.fn(() => null);

    await updateSkills({
      getInit,
      exec,
      spawnInteractive: mock.fn(async () => {}),
      fetchVersion,
      writeKey,
      readKey,
    });

    assert.strictEqual(exec.mock.calls.length, 1);
    assert.deepStrictEqual(exec.mock.calls[0].arguments[0], 'claude');
    assert.deepStrictEqual(exec.mock.calls[0].arguments[1], [
      'plugin',
      'update',
      'spark-cli@MemCo',
    ]);
  });

  it('updates other IDE skills when other IDE is configured', async () => {
    const spawnInteractive = mock.fn(async () => {});
    const getInit = mock.fn(() => ({ ides: ['other'], skillsVersion: '1.0.0' }));
    const fetchVersion = mock.fn(async () => ({ version: '1.1.0' }));
    const writeKey = mock.fn();
    const readKey = mock.fn(() => null);

    await updateSkills({
      getInit,
      exec: mock.fn(async () => ({ stdout: '', stderr: '' })),
      spawnInteractive,
      fetchVersion,
      writeKey,
      readKey,
    });

    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
    assert.deepStrictEqual(spawnInteractive.mock.calls[0].arguments[0], 'npx');
    assert.deepStrictEqual(spawnInteractive.mock.calls[0].arguments[1], [
      'skills',
      'update',
      'memcoai/spark-cli-skills',
    ]);
  });

  it('updates both IDEs when both are configured', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const spawnInteractive = mock.fn(async () => {});
    const getInit = mock.fn(() => ({ ides: ['claude', 'other'], skillsVersion: '1.0.0' }));
    const fetchVersion = mock.fn(async () => ({ version: '1.1.0' }));
    const writeKey = mock.fn();
    const readKey = mock.fn(() => null);

    await updateSkills({ getInit, exec, spawnInteractive, fetchVersion, writeKey, readKey });

    assert.strictEqual(exec.mock.calls.length, 1);
    assert.strictEqual(spawnInteractive.mock.calls.length, 1);
  });

  it('continues when Claude Code update fails', async () => {
    const exec = mock.fn(async () => {
      throw new Error('claude not found');
    });
    const getInit = mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' }));
    const fetchVersion = mock.fn(async () => ({ version: '1.1.0' }));
    const writeKey = mock.fn();
    const readKey = mock.fn(() => null);

    await updateSkills({
      getInit,
      exec,
      spawnInteractive: mock.fn(async () => {}),
      fetchVersion,
      writeKey,
      readKey,
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('claude not found'));
  });

  it('continues when other IDE update fails', async () => {
    const spawnInteractive = mock.fn(async () => {
      throw new Error('npx not found');
    });
    const getInit = mock.fn(() => ({ ides: ['other'], skillsVersion: '1.0.0' }));
    const fetchVersion = mock.fn(async () => ({ version: '1.1.0' }));
    const writeKey = mock.fn();
    const readKey = mock.fn(() => null);

    await updateSkills({
      getInit,
      exec: mock.fn(async () => ({ stdout: '', stderr: '' })),
      spawnInteractive,
      fetchVersion,
      writeKey,
      readKey,
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('npx not found'));
  });

  it('updates skills version in local settings when local init exists', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const getInit = mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' }));
    const fetchVersion = mock.fn(async () => ({ version: '1.2.0' }));
    const writeKey = mock.fn();
    const localInit = { ides: ['claude'], skillsVersion: '1.0.0' };
    const readKey = mock.fn((path) => {
      if (path.includes('.spark/settings.json') && !path.includes('~')) return localInit;
      return null;
    });

    await updateSkills({
      getInit,
      exec,
      spawnInteractive: mock.fn(async () => {}),
      fetchVersion,
      writeKey,
      readKey,
    });

    const writeCalls = writeKey.mock.calls;
    const localWrite = writeCalls.find(
      (c) => c.arguments[1] === 'init' && c.arguments[2]?.skillsVersion === '1.2.0',
    );
    assert.ok(localWrite, 'should write updated skills version to local init');
  });

  it('updates skills version in global settings when globalInit exists', async () => {
    const exec = mock.fn(async () => ({ stdout: '', stderr: '' }));
    const getInit = mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' }));
    const fetchVersion = mock.fn(async () => ({ version: '1.2.0' }));
    const writeKey = mock.fn();
    const globalInit = { ides: ['claude'], skillsVersion: '1.0.0' };
    const readKey = mock.fn((path, key) => {
      if (key === 'globalInit') return globalInit;
      return null;
    });

    await updateSkills({
      getInit,
      exec,
      spawnInteractive: mock.fn(async () => {}),
      fetchVersion,
      writeKey,
      readKey,
    });

    const writeCalls = writeKey.mock.calls;
    const globalWrite = writeCalls.find(
      (c) => c.arguments[1] === 'globalInit' && c.arguments[2]?.skillsVersion === '1.2.0',
    );
    assert.ok(globalWrite, 'should write updated skills version to globalInit');
  });
});
