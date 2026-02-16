import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTokenExpired } from '../src/credentials.js';

describe('isTokenExpired', () => {
  it('returns false for null credentials', () => {
    assert.strictEqual(isTokenExpired(null), false);
  });

  it('returns false for undefined credentials', () => {
    assert.strictEqual(isTokenExpired(undefined), false);
  });

  it('returns false when expiresAt is missing', () => {
    assert.strictEqual(isTokenExpired({ accessToken: 'abc' }), false);
  });

  it('returns false when expiresAt is null', () => {
    assert.strictEqual(isTokenExpired({ expiresAt: null }), false);
  });

  it('returns false when token expires far in the future', () => {
    const credentials = { expiresAt: Date.now() + 60 * 60 * 1000 }; // 1 hour from now
    assert.strictEqual(isTokenExpired(credentials), false);
  });

  it('returns true when token expired in the past', () => {
    const credentials = { expiresAt: Date.now() - 60 * 1000 }; // 1 minute ago
    assert.strictEqual(isTokenExpired(credentials), true);
  });

  it('returns true when token expires within 5-minute buffer', () => {
    const credentials = { expiresAt: Date.now() + 2 * 60 * 1000 }; // 2 minutes from now
    assert.strictEqual(isTokenExpired(credentials), true);
  });

  it('returns false when token expires just beyond 5-minute buffer', () => {
    const credentials = { expiresAt: Date.now() + 6 * 60 * 1000 }; // 6 minutes from now
    assert.strictEqual(isTokenExpired(credentials), false);
  });

  it('returns true when expiresAt equals exactly now + 5 minutes', () => {
    // At exactly the boundary: Date.now() >= expiresAt - 5min → true
    const credentials = { expiresAt: Date.now() + 5 * 60 * 1000 };
    assert.strictEqual(isTokenExpired(credentials), true);
  });
});
