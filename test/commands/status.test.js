import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runStatus } from '../../src/commands/status.js';
import { SPARK_ORG_ID } from '../../src/constants.js';
import { setupCommandMocks, getLogOutput } from '../helpers.js';

describe('runStatus', () => {
  const mocks = setupCommandMocks();

  const defaultDeps = (overrides = {}) => ({
    getVersion: () => '1.0.0',
    checkUpdate: mock.fn(async () => null),
    getNotification: mock.fn(() => null),
    getUser: mock.fn(async () => ({ user: { first_name: 'User' } })),
    checkSkills: mock.fn(async () => null),
    getSkillsNote: mock.fn(() => null),
    getInit: mock.fn(() => null),
    ...overrides,
  });

  it('shows up-to-date version and authenticated user', async () => {
    await runStatus(
      defaultDeps({
        checkUpdate: mock.fn(async () => ({ version: '1.0.0' })),
        getUser: mock.fn(async () => ({
          user: { first_name: 'Test', last_name: 'User', email: 'test@example.com' },
        })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('v1.0.0'));
    assert.ok(output.includes('latest version'));
    assert.ok(output.includes('Test User'));
    assert.ok(output.includes('Environment: Public'));
  });

  it('shows organization name when not Spark', async () => {
    await runStatus(
      defaultDeps({
        getUser: mock.fn(async () => ({
          user: { first_name: 'Test', last_name: 'User', organization_name: 'Acme Corp' },
        })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Organization: Acme Corp'));
    assert.ok(!output.includes('Environment: Public'));
  });

  it('shows update available when outdated', async () => {
    await runStatus(
      defaultDeps({
        getVersion: () => '0.9.0',
        checkUpdate: mock.fn(async () => ({ version: '1.0.0' })),
        getNotification: mock.fn(() => ({
          type: 'update',
          message: 'Update available: v0.9.0 → v1.0.0. Run: spark update',
        })),
        getUser: mock.fn(async () => ({ user: { first_name: 'Test', last_name: 'User' } })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Update available'));
    assert.ok(output.includes('spark update'));
  });

  it('shows auth error when not authenticated', async () => {
    await runStatus(
      defaultDeps({
        getUser: mock.fn(async () => {
          throw new Error('Not authenticated');
        }),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Not authenticated'));
    assert.ok(output.includes('spark login'));
  });

  it('handles update check failure gracefully', async () => {
    await runStatus(
      defaultDeps({
        checkUpdate: mock.fn(async () => {
          throw new Error('Network error');
        }),
        getUser: mock.fn(async () => ({ user: { first_name: 'Test', last_name: 'User' } })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Could not check for updates'));
    assert.ok(output.includes('Test User'));
  });

  it('displays email when name is not available', async () => {
    await runStatus(
      defaultDeps({
        getUser: mock.fn(async () => ({ user: { email: 'user@example.com' } })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('user@example.com'));
  });

  it('shows latest version when no update info returned', async () => {
    await runStatus(defaultDeps());

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('latest version'));
  });

  it('shows no skills configured when init data is missing', async () => {
    await runStatus(defaultDeps());

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('No skills configured'));
  });

  it('shows skills up to date when configured and current', async () => {
    await runStatus(
      defaultDeps({
        checkSkills: mock.fn(async () => ({ version: '1.0.0' })),
        getSkillsNote: mock.fn(() => null),
        getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Skills configured for: Claude Code'));
    assert.ok(output.includes('Skills are up to date'));
  });

  it('labels the Codex IDE in skills status', async () => {
    await runStatus(
      defaultDeps({
        checkSkills: mock.fn(async () => ({ version: '1.0.0' })),
        getSkillsNote: mock.fn(() => null),
        getInit: mock.fn(() => ({ ides: ['codex'], skillsVersion: '1.0.0' })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Skills configured for: Codex'));
  });

  it('shows skills update notification when outdated', async () => {
    await runStatus(
      defaultDeps({
        checkSkills: mock.fn(async () => ({ version: '2.0.0' })),
        getSkillsNote: mock.fn(() => ({
          type: 'skills-update',
          message: 'Skills update available: v1.0.0 → v2.0.0',
        })),
        getInit: mock.fn(() => ({ ides: ['claude', 'other'], skillsVersion: '1.0.0' })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Claude Code'));
    assert.ok(output.includes('Cursor/Windsurf'));
    assert.ok(output.includes('Skills update available'));
  });

  it('handles skills check failure gracefully', async () => {
    await runStatus(
      defaultDeps({
        checkSkills: mock.fn(async () => {
          throw new Error('Network error');
        }),
        getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Could not check for skills updates'));
  });

  it('shows variant mismatch warning when stored variant differs from detected', async () => {
    await runStatus(
      defaultDeps({
        getUser: mock.fn(async () => ({
          user: {
            first_name: 'Test',
            organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e',
            organization_name: 'Acme Corp',
          },
        })),
        getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
        checkSkills: mock.fn(async () => null),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Variant mismatch'));
    assert.ok(output.includes('spark update'));
  });

  it('does not show variant mismatch when variants match', async () => {
    await runStatus(
      defaultDeps({
        getUser: mock.fn(async () => ({
          user: { first_name: 'Test', organization_id: SPARK_ORG_ID },
        })),
        getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
        checkSkills: mock.fn(async () => null),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(!output.includes('Variant mismatch'));
  });

  it('checks skills version using stored variant, not detected variant on mismatch', async () => {
    const checkSkills = mock.fn(async () => ({ version: '1.0.0' }));
    await runStatus(
      defaultDeps({
        getUser: mock.fn(async () => ({
          user: {
            first_name: 'Test',
            organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e',
            organization_name: 'Acme Corp',
          },
        })),
        getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
        checkSkills,
      }),
    );

    // Skills check should use the stored (public) variant key, not the detected (teams) one
    assert.strictEqual(checkSkills.mock.calls.length, 1);
    assert.strictEqual(checkSkills.mock.calls[0].arguments[0], 'public');
  });

  it('does not auto-swap plugins on variant mismatch', async () => {
    await runStatus(
      defaultDeps({
        getUser: mock.fn(async () => ({
          user: {
            first_name: 'Test',
            organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e',
          },
        })),
        getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
        checkSkills: mock.fn(async () => null),
      }),
    );

    // No exec calls should be made — status is read-only
    const output = getLogOutput(mocks.logMock);
    assert.ok(!output.includes('Swapping'));
    assert.ok(!output.includes('plugin installed'));
  });
});
