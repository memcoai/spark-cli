import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSemver, compareVersions } from '../src/update-check.js';

describe('parseSemver', () => {
  it('parses a valid version', () => {
    assert.deepStrictEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3 });
  });

  it('strips leading v prefix', () => {
    assert.deepStrictEqual(parseSemver('v2.0.1'), { major: 2, minor: 0, patch: 1 });
  });

  it('ignores pre-release suffix', () => {
    assert.deepStrictEqual(parseSemver('1.2.3-beta.1'), { major: 1, minor: 2, patch: 3 });
  });

  it('returns null for non-string', () => {
    assert.strictEqual(parseSemver(null), null);
    assert.strictEqual(parseSemver(undefined), null);
    assert.strictEqual(parseSemver(123), null);
  });

  it('returns null for invalid format', () => {
    assert.strictEqual(parseSemver('not-a-version'), null);
    assert.strictEqual(parseSemver('1.2'), null);
    assert.strictEqual(parseSemver(''), null);
  });
});

describe('compareVersions', () => {
  it('returns major when major version differs', () => {
    assert.strictEqual(compareVersions('1.0.0', '2.0.0'), 'major');
  });

  it('returns minor when minor version differs', () => {
    assert.strictEqual(compareVersions('1.0.0', '1.1.0'), 'minor');
  });

  it('returns patch when patch version differs', () => {
    assert.strictEqual(compareVersions('1.0.0', '1.0.1'), 'patch');
  });

  it('returns null when versions are equal', () => {
    assert.strictEqual(compareVersions('1.2.3', '1.2.3'), null);
  });

  it('returns null when current is newer', () => {
    assert.strictEqual(compareVersions('2.0.0', '1.0.0'), null);
    assert.strictEqual(compareVersions('1.1.0', '1.0.0'), null);
    assert.strictEqual(compareVersions('1.0.1', '1.0.0'), null);
  });

  it('returns null for invalid versions', () => {
    assert.strictEqual(compareVersions('bad', '1.0.0'), null);
    assert.strictEqual(compareVersions('1.0.0', 'bad'), null);
  });

  it('handles major bump with higher minor/patch in current', () => {
    assert.strictEqual(compareVersions('1.9.9', '2.0.0'), 'major');
  });
});
