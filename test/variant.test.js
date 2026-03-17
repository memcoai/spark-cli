import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, SPARK_ORG_ID, getVariant } from '../src/constants.js';
import { detectVariant, ensureCorrectVariant } from '../src/variant.js';
import { setupCommandMocks, getLogOutput, buildSetupDeps } from './helpers.js';

describe('getVariant', () => {
  it('returns public variant when user is null', () => {
    assert.strictEqual(getVariant(null), VARIANTS.public);
  });

  it('returns public variant when user is undefined', () => {
    assert.strictEqual(getVariant(undefined), VARIANTS.public);
  });

  it('returns public variant when user has no organization_id', () => {
    assert.strictEqual(getVariant({ email: 'test@example.com' }), VARIANTS.public);
  });

  it('returns public variant when user belongs to Spark org', () => {
    assert.strictEqual(getVariant({ organization_id: SPARK_ORG_ID }), VARIANTS.public);
  });

  it('returns teams variant when user belongs to a different org', () => {
    assert.strictEqual(
      getVariant({ organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e' }),
      VARIANTS.teams,
    );
  });
});

describe('detectVariant', () => {
  it('returns public variant when user belongs to Spark org', async () => {
    const result = await detectVariant({
      getUser: mock.fn(async () => ({ user: { organization_id: SPARK_ORG_ID } })),
    });
    assert.strictEqual(result, VARIANTS.public);
  });

  it('returns teams variant when user belongs to a different org', async () => {
    const result = await detectVariant({
      getUser: mock.fn(async () => ({
        user: { organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e' },
      })),
    });
    assert.strictEqual(result, VARIANTS.teams);
  });

  it('throws when getUser throws (unauthenticated)', async () => {
    await assert.rejects(
      () =>
        detectVariant({
          getUser: mock.fn(async () => {
            throw new Error('401 Unauthorized');
          }),
        }),
      { message: '401 Unauthorized' },
    );
  });

  it('handles response without user wrapper', async () => {
    const result = await detectVariant({
      getUser: mock.fn(async () => ({
        organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e',
      })),
    });
    assert.strictEqual(result, VARIANTS.teams);
  });
});

describe('ensureCorrectVariant', () => {
  const mocks = setupCommandMocks();

  const defaultDeps = (overrides = {}) =>
    buildSetupDeps({
      getUser: mock.fn(async () => ({ user: { organization_id: SPARK_ORG_ID } })),
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
      readKey: mock.fn(() => null),
      ...overrides,
    });

  it('returns detected variant without swapping when no init data exists', async () => {
    const deps = defaultDeps({ getInit: mock.fn(() => null) });
    const result = await ensureCorrectVariant(deps);
    assert.strictEqual(result, VARIANTS.public);
    assert.strictEqual(deps.exec.mock.calls.length, 0);
  });

  it('returns detected variant without swapping when init data has no IDEs', async () => {
    const deps = defaultDeps({ getInit: mock.fn(() => ({ ides: [], skillsVersion: '1.0.0' })) });
    const result = await ensureCorrectVariant(deps);
    assert.strictEqual(result, VARIANTS.public);
    assert.strictEqual(deps.exec.mock.calls.length, 0);
  });

  it('returns null when user is not authenticated', async () => {
    const result = await ensureCorrectVariant(
      defaultDeps({
        getUser: mock.fn(async () => {
          throw new Error('401 Unauthorized');
        }),
      }),
    );
    assert.strictEqual(result, null);
  });

  it('returns variant without swapping when variant matches', async () => {
    const deps = defaultDeps();
    const result = await ensureCorrectVariant(deps);

    // Should return the detected variant
    assert.strictEqual(result, VARIANTS.public);
    // Should NOT call exec for uninstall/reinstall
    assert.strictEqual(deps.exec.mock.calls.length, 0);
  });

  it('swaps from public to teams when mismatch detected', async () => {
    const deps = defaultDeps({
      getUser: mock.fn(async () => ({
        user: { organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e' },
      })),
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
    });

    const result = await ensureCorrectVariant(deps);

    assert.strictEqual(result, VARIANTS.teams);
    // Should have called exec for uninstall + reinstall
    assert.ok(deps.exec.mock.calls.length >= 2);
    // Verify uninstall used public plugin
    const uninstallCall = deps.exec.mock.calls.find(
      (c) => c.arguments[1]?.includes('uninstall') || c.arguments[1]?.includes('remove'),
    );
    assert.ok(uninstallCall);
    // Verify install used teams plugin
    const installCall = deps.exec.mock.calls.find(
      (c) =>
        c.arguments[1]?.includes('install') &&
        c.arguments[1]?.includes(VARIANTS.teams.claudePlugin),
    );
    assert.ok(installCall);
  });

  it('swaps from teams to public when mismatch detected', async () => {
    const deps = defaultDeps({
      getUser: mock.fn(async () => ({ user: { organization_id: SPARK_ORG_ID } })),
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'teams' })),
    });

    const result = await ensureCorrectVariant(deps);

    assert.strictEqual(result, VARIANTS.public);
    assert.ok(deps.exec.mock.calls.length >= 2);
  });

  it('defaults stored variant to public when not set', async () => {
    const deps = defaultDeps({
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0' })),
    });

    // User is public, stored is defaulted to public → no swap
    const result = await ensureCorrectVariant(deps);
    assert.strictEqual(result, VARIANTS.public);
    assert.strictEqual(deps.exec.mock.calls.length, 0);
  });

  it('updates init data after swap', async () => {
    const deps = defaultDeps({
      getUser: mock.fn(async () => ({
        user: { organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e' },
      })),
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
      readKey: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
    });

    await ensureCorrectVariant(deps);

    // Should have written updated init data with new variant
    const writeCall = deps.writeKey.mock.calls.find((c) => c.arguments[2]?.variant === 'teams');
    assert.ok(writeCall, 'should write updated init data with teams variant');
  });

  it('uses global scope when local init has ides but no skillsVersion', async () => {
    const deps = defaultDeps({
      getUser: mock.fn(async () => ({
        user: { organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e' },
      })),
      getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
      readKey: mock.fn((path, key) => {
        // Local init exists but is missing skillsVersion (partial/corrupt state)
        if (key === 'init') return { ides: ['claude'] };
        return null;
      }),
    });

    await ensureCorrectVariant(deps);

    // Should write to globalInit (global scope), not local init
    const writeCall = deps.writeKey.mock.calls.find((c) => c.arguments[1] === 'globalInit');
    assert.ok(writeCall, 'should write to globalInit when local init is missing skillsVersion');
    const localWrite = deps.writeKey.mock.calls.find((c) => c.arguments[1] === 'init');
    assert.strictEqual(localWrite, undefined, 'should not write to local init');
  });

  it('prints warning and info messages during swap', async () => {
    await ensureCorrectVariant(
      defaultDeps({
        getUser: mock.fn(async () => ({
          user: { organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e' },
        })),
        getInit: mock.fn(() => ({ ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' })),
      }),
    );

    const output = getLogOutput(mocks.logMock);
    assert.ok(output.includes('Variant mismatch'));
    assert.ok(output.includes('Swapping to teams'));
    assert.ok(output.includes('Variant swap complete'));
  });
});
