import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCompatibility } from '../src/update-check.js';

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
      assert.ok(!result.messages.some((m) => m === ''));
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
