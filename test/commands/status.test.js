import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runStatus } from '../../src/commands/status.js';
import { setupCommandMocks } from '../helpers.js';

describe('runStatus', () => {
  const mocks = setupCommandMocks();
  let stdoutMock;

  beforeEach(() => {
    stdoutMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    stdoutMock.mock.restore();
  });

  const getLogOutput = (m) => m.mock.calls.map((c) => c.arguments.join(' ')).join('\n');

  const noSkillsDeps = {
    checkSkills: mock.fn(async () => null),
    getSkillsNote: mock.fn(() => null),
    getInit: mock.fn(() => null),
  };

  it('shows up-to-date version and authenticated user', async () => {
    await runStatus({
      getVersion: () => '1.0.0',
      checkUpdate: mock.fn(async () => ({ version: '1.0.0' })),
      getNotification: mock.fn(() => null),
      getUser: mock.fn(async () => ({
        user: { first_name: 'Test', last_name: 'User', email: 'test@example.com' },
      })),
      ...noSkillsDeps,
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('v1.0.0'));
    assert.ok(output.includes('latest version'));
    assert.ok(output.includes('Test User'));
  });

  it('shows update available when outdated', async () => {
    await runStatus({
      getVersion: () => '0.9.0',
      checkUpdate: mock.fn(async () => ({ version: '1.0.0' })),
      getNotification: mock.fn(() => ({
        type: 'update',
        message: 'Update available: v0.9.0 → v1.0.0. Run: spark update',
      })),
      getUser: mock.fn(async () => ({ user: { first_name: 'Test', last_name: 'User' } })),
      ...noSkillsDeps,
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Update available'));
    assert.ok(output.includes('spark update'));
  });

  it('shows auth error when not authenticated', async () => {
    await runStatus({
      getVersion: () => '1.0.0',
      checkUpdate: mock.fn(async () => null),
      getNotification: mock.fn(() => null),
      getUser: mock.fn(async () => {
        throw new Error('Not authenticated');
      }),
      ...noSkillsDeps,
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Not authenticated'));
    assert.ok(output.includes('spark login'));
  });

  it('handles update check failure gracefully', async () => {
    await runStatus({
      getVersion: () => '1.0.0',
      checkUpdate: mock.fn(async () => {
        throw new Error('Network error');
      }),
      getNotification: mock.fn(() => null),
      getUser: mock.fn(async () => ({ user: { first_name: 'Test', last_name: 'User' } })),
      ...noSkillsDeps,
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Could not check for updates'));
    assert.ok(output.includes('Test User'));
  });

  it('displays email when name is not available', async () => {
    await runStatus({
      getVersion: () => '1.0.0',
      checkUpdate: mock.fn(async () => null),
      getNotification: mock.fn(() => null),
      getUser: mock.fn(async () => ({ user: { email: 'user@example.com' } })),
      ...noSkillsDeps,
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('user@example.com'));
  });

  it('shows latest version when no update info returned', async () => {
    await runStatus({
      getVersion: () => '1.0.0',
      checkUpdate: mock.fn(async () => null),
      getNotification: mock.fn(() => null),
      getUser: mock.fn(async () => ({ user: { first_name: 'User' } })),
      ...noSkillsDeps,
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('latest version'));
  });

  it('shows no skills configured when init data is missing', async () => {
    await runStatus({
      getVersion: () => '1.0.0',
      checkUpdate: mock.fn(async () => null),
      getNotification: mock.fn(() => null),
      getUser: mock.fn(async () => ({ user: { first_name: 'User' } })),
      checkSkills: mock.fn(async () => null),
      getSkillsNote: mock.fn(() => null),
      getInit: mock.fn(() => null),
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('No skills configured'));
  });

  it('shows skills up to date when configured and current', async () => {
    await runStatus({
      getVersion: () => '1.0.0',
      checkUpdate: mock.fn(async () => null),
      getNotification: mock.fn(() => null),
      getUser: mock.fn(async () => ({ user: { first_name: 'User' } })),
      checkSkills: mock.fn(async () => ({ version: '1.0.0' })),
      getSkillsNote: mock.fn(() => null),
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' })),
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Skills configured for: Claude Code'));
    assert.ok(output.includes('Skills are up to date'));
  });

  it('shows skills update notification when outdated', async () => {
    await runStatus({
      getVersion: () => '1.0.0',
      checkUpdate: mock.fn(async () => null),
      getNotification: mock.fn(() => null),
      getUser: mock.fn(async () => ({ user: { first_name: 'User' } })),
      checkSkills: mock.fn(async () => ({ version: '2.0.0' })),
      getSkillsNote: mock.fn(() => ({
        type: 'skills-update',
        message: 'Skills update available: v1.0.0 → v2.0.0',
      })),
      getInit: mock.fn(() => ({ ides: ['claude', 'other'], skillsVersion: '1.0.0' })),
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Claude Code'));
    assert.ok(output.includes('Cursor/Windsurf'));
    assert.ok(output.includes('Skills update available'));
  });

  it('handles skills check failure gracefully', async () => {
    await runStatus({
      getVersion: () => '1.0.0',
      checkUpdate: mock.fn(async () => null),
      getNotification: mock.fn(() => null),
      getUser: mock.fn(async () => ({ user: { first_name: 'User' } })),
      checkSkills: mock.fn(async () => {
        throw new Error('Network error');
      }),
      getSkillsNote: mock.fn(() => null),
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' })),
    });

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Could not check for skills updates'));
  });
});
