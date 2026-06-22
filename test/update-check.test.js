import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCompatibility, getSkillsNotification, getInitData } from '../src/update-check.js';

const makeCompat = (overrides = {}) => ({
  latest_version: '2.0.0',
  minimum_version: '1.0.0',
  deprecations: [],
  message: '',
  ...overrides,
});

describe('evaluateCompatibility', () => {
  describe('blocked', () => {
    it('blocks when local version is below minimum_version', () => {
      const result = evaluateCompatibility('0.9.0', makeCompat({ minimum_version: '1.0.0' }));
      assert.strictEqual(result.blocked, true);
      assert.ok(result.messages.some((m) => m.includes('no longer supported')));
    });

    it('does not block when local version equals minimum_version', () => {
      const result = evaluateCompatibility('1.0.0', makeCompat({ minimum_version: '1.0.0' }));
      assert.strictEqual(result.blocked, false);
    });

    it('does not block when local version exceeds minimum_version', () => {
      const result = evaluateCompatibility('1.5.0', makeCompat({ minimum_version: '1.0.0' }));
      assert.strictEqual(result.blocked, false);
    });

    it('includes minimum version in block message', () => {
      const result = evaluateCompatibility('0.5.0', makeCompat({ minimum_version: '1.2.0' }));
      assert.ok(result.messages.some((m) => m.includes('v1.2.0')));
    });
  });

  describe('deprecation', () => {
    it('matches deprecation when local version is below version_below', () => {
      const compat = makeCompat({
        deprecations: [
          { version_below: '1.5.0', deprecated_at: '2025-06-01', message: 'Upgrade soon' },
        ],
      });
      const result = evaluateCompatibility('1.4.0', compat);
      assert.ok(result.deprecation);
      assert.ok(result.messages.some((m) => m.includes('Upgrade soon')));
    });

    it('does not match deprecation when local version equals version_below', () => {
      const compat = makeCompat({
        deprecations: [{ version_below: '1.5.0', deprecated_at: '2025-06-01', message: 'Upgrade' }],
      });
      const result = evaluateCompatibility('1.5.0', compat);
      assert.strictEqual(result.deprecation, null);
    });

    it('does not match deprecation when local version exceeds version_below', () => {
      const compat = makeCompat({
        deprecations: [{ version_below: '1.5.0', deprecated_at: '2025-06-01', message: 'Upgrade' }],
      });
      const result = evaluateCompatibility('1.6.0', compat);
      assert.strictEqual(result.deprecation, null);
    });

    it('uses first matching deprecation when multiple exist', () => {
      const compat = makeCompat({
        deprecations: [
          { version_below: '2.0.0', deprecated_at: '2025-07-01', message: 'First' },
          { version_below: '1.5.0', deprecated_at: '2025-06-01', message: 'Second' },
        ],
      });
      const result = evaluateCompatibility('1.4.0', compat);
      assert.ok(result.messages.some((m) => m.includes('First')));
      assert.ok(!result.messages.some((m) => m.includes('Second')));
    });

    it('provides fallback message when deprecation has no message', () => {
      const compat = makeCompat({
        deprecations: [{ version_below: '1.5.0', deprecated_at: '2025-06-01' }],
      });
      const result = evaluateCompatibility('1.4.0', compat);
      assert.ok(result.deprecation);
      assert.ok(result.messages.some((m) => m.includes('1.5.0')));
    });

    it('skips deprecation entries with no version_below', () => {
      const compat = makeCompat({
        deprecations: [
          { deprecated_at: '2025-06-01', message: 'Bad entry' },
          { version_below: '1.5.0', deprecated_at: '2025-06-01', message: 'Valid' },
        ],
      });
      const result = evaluateCompatibility('1.4.0', compat);
      assert.ok(result.messages.some((m) => m.includes('Valid')));
    });
  });

  describe('message field', () => {
    it('includes backend message when blocked', () => {
      const compat = makeCompat({ minimum_version: '2.0.0', message: 'Backend says hi' });
      const result = evaluateCompatibility('1.0.0', compat);
      assert.ok(result.messages.some((m) => m.includes('Backend says hi')));
    });

    it('includes backend message when deprecated', () => {
      const compat = makeCompat({
        deprecations: [{ version_below: '2.0.0', message: 'Deprecation' }],
        message: 'Backend notice',
      });
      const result = evaluateCompatibility('1.0.0', compat);
      assert.ok(result.messages.some((m) => m.includes('Backend notice')));
    });

    it('does not include backend message when neither blocked nor deprecated', () => {
      const compat = makeCompat({ message: 'Backend notice' });
      const result = evaluateCompatibility('2.0.0', compat);
      assert.ok(!result.messages.some((m) => m.includes('Backend notice')));
    });

    it('skips empty message', () => {
      const compat = makeCompat({ minimum_version: '2.0.0', message: '' });
      const result = evaluateCompatibility('1.0.0', compat);
      assert.ok(!result.messages.includes((m) => m === ''));
    });
  });

  describe('edge cases', () => {
    it('returns all-clear for null compatibility', () => {
      const result = evaluateCompatibility('1.0.0', null);
      assert.strictEqual(result.blocked, false);
      assert.strictEqual(result.deprecation, null);
      assert.strictEqual(result.messages.length, 0);
    });

    it('returns all-clear for null localVersion', () => {
      const result = evaluateCompatibility(null, makeCompat());
      assert.strictEqual(result.blocked, false);
    });

    it('returns all-clear for undefined localVersion', () => {
      const result = evaluateCompatibility(undefined, makeCompat());
      assert.strictEqual(result.blocked, false);
    });

    it('handles version with v prefix', () => {
      const result = evaluateCompatibility('v0.9.0', makeCompat({ minimum_version: '1.0.0' }));
      assert.strictEqual(result.blocked, true);
    });

    it('handles pre-release versions', () => {
      const result = evaluateCompatibility(
        '0.9.0-beta.1',
        makeCompat({ minimum_version: '1.0.0' }),
      );
      assert.strictEqual(result.blocked, true);
    });

    it('handles missing deprecations array', () => {
      const compat = makeCompat();
      delete compat.deprecations;
      const result = evaluateCompatibility('1.0.0', compat);
      assert.strictEqual(result.deprecation, null);
    });

    it('handles missing minimum_version', () => {
      const compat = makeCompat();
      delete compat.minimum_version;
      const result = evaluateCompatibility('0.1.0', compat);
      assert.strictEqual(result.blocked, false);
    });

    it('can be both blocked and deprecated', () => {
      const compat = makeCompat({
        minimum_version: '2.0.0',
        deprecations: [{ version_below: '3.0.0', message: 'Deprecated' }],
        message: 'Announcement',
      });
      const result = evaluateCompatibility('1.0.0', compat);
      assert.strictEqual(result.blocked, true);
      assert.ok(result.deprecation);
      assert.ok(result.messages.some((m) => m.includes('no longer supported')));
      assert.ok(result.messages.some((m) => m.includes('Deprecated')));
      assert.ok(result.messages.some((m) => m.includes('Announcement')));
    });
  });
});

describe('getInitData', () => {
  const makeReadKey = (local, global) =>
    mock.fn((path, key) => {
      if (key === 'init') return local;
      if (key === 'globalInit') return global;
      return null;
    });

  it('returns local init unchanged when globalInit has no global-only IDEs', () => {
    const readKey = makeReadKey(
      { ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' },
      null,
    );
    assert.deepStrictEqual(getInitData(readKey).ides, ['claude']);
  });

  it('merges global-only Codex from globalInit into a project-local init', () => {
    const readKey = makeReadKey(
      { ides: ['claude'], skillsVersion: '1.0.0', variant: 'public' },
      { ides: ['codex'], skillsVersion: '1.0.0', variant: 'public' },
    );
    assert.deepStrictEqual(getInitData(readKey).ides, ['claude', 'codex']);
  });

  it('does not duplicate Codex when it is already in the local ides', () => {
    const readKey = makeReadKey(
      { ides: ['claude', 'codex'], skillsVersion: '1.0.0' },
      { ides: ['codex'], skillsVersion: '1.0.0' },
    );
    assert.deepStrictEqual(getInitData(readKey).ides, ['claude', 'codex']);
  });

  it('does not merge non-global-only IDEs (e.g. global Claude/Other) into the local record', () => {
    const readKey = makeReadKey(
      { ides: ['claude'], skillsVersion: '1.0.0' },
      { ides: ['other'], skillsVersion: '1.0.0' },
    );
    assert.deepStrictEqual(getInitData(readKey).ides, ['claude']);
  });

  it('falls back to globalInit (with Codex) when there is no local init', () => {
    const readKey = makeReadKey(null, {
      ides: ['codex'],
      skillsVersion: '1.0.0',
      variant: 'teams',
    });
    assert.deepStrictEqual(getInitData(readKey).ides, ['codex']);
  });

  it('returns null when neither record is valid', () => {
    assert.strictEqual(getInitData(makeReadKey(null, null)), null);
  });
});

describe('getSkillsNotification', () => {
  it('returns null when latestInfo is null', () => {
    assert.strictEqual(
      getSkillsNotification(null, { ides: ['claude'], skillsVersion: '1.0.0' }),
      null,
    );
  });

  it('returns null when initData is null', () => {
    assert.strictEqual(getSkillsNotification({ version: '2.0.0' }, null), null);
  });

  it('returns null when initData has no skillsVersion', () => {
    assert.strictEqual(getSkillsNotification({ version: '2.0.0' }, { ides: ['claude'] }), null);
  });

  it('returns null when initData has no ides', () => {
    assert.strictEqual(
      getSkillsNotification({ version: '2.0.0' }, { skillsVersion: '1.0.0' }),
      null,
    );
  });

  it('returns null when initData has empty ides array', () => {
    assert.strictEqual(
      getSkillsNotification({ version: '2.0.0' }, { ides: [], skillsVersion: '1.0.0' }),
      null,
    );
  });

  it('returns null when versions are equal', () => {
    const result = getSkillsNotification(
      { version: '1.0.0' },
      { ides: ['claude'], skillsVersion: '1.0.0' },
    );
    assert.strictEqual(result, null);
  });

  it('returns null when installed is newer than latest', () => {
    const result = getSkillsNotification(
      { version: '1.0.0' },
      { ides: ['claude'], skillsVersion: '2.0.0' },
    );
    assert.strictEqual(result, null);
  });

  it('returns notification with Claude Code update command', () => {
    const result = getSkillsNotification(
      { version: '2.0.0' },
      { ides: ['claude'], skillsVersion: '1.0.0' },
    );
    assert.ok(result);
    assert.strictEqual(result.type, 'skills-update');
    assert.ok(result.message.includes('v1.0.0'));
    assert.ok(result.message.includes('v2.0.0'));
    assert.ok(result.message.includes('claude plugin update'));
  });

  it('returns notification with Codex update command', () => {
    const result = getSkillsNotification(
      { version: '2.0.0' },
      { ides: ['codex'], skillsVersion: '1.0.0' },
    );
    assert.ok(result);
    assert.ok(result.message.includes('codex plugin marketplace upgrade MemCo'));
  });

  it('returns notification with Cursor/Windsurf update command', () => {
    const result = getSkillsNotification(
      { version: '2.0.0' },
      { ides: ['other'], skillsVersion: '1.0.0' },
    );
    assert.ok(result);
    assert.ok(result.message.includes('npx skills update'));
  });

  it('returns notification with both update commands when both IDEs configured', () => {
    const result = getSkillsNotification(
      { version: '2.0.0' },
      { ides: ['claude', 'other'], skillsVersion: '1.0.0' },
    );
    assert.ok(result);
    assert.ok(result.message.includes('claude plugin update'));
    assert.ok(result.message.includes('npx skills update'));
  });

  it('handles version with v prefix', () => {
    const result = getSkillsNotification(
      { version: 'v2.0.0' },
      { ides: ['claude'], skillsVersion: 'v1.0.0' },
    );
    assert.ok(result);
    assert.strictEqual(result.type, 'skills-update');
  });

  it('handles pre-release versions', () => {
    const result = getSkillsNotification(
      { version: '2.0.0' },
      { ides: ['claude'], skillsVersion: '1.0.0-beta.1' },
    );
    assert.ok(result);
  });
});
