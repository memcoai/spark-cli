import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getApiBase,
  validateApiBase,
  DEFAULT_API_BASE,
  getAuthSuccessUrl,
  getAuthErrorUrl,
} from '../src/constants.js';

describe('getApiBase', () => {
  const originalEnv = process.env.SPARK_API_BASE;

  function setEnv(value) {
    process.env.SPARK_API_BASE = value;
  }

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SPARK_API_BASE;
    } else {
      process.env.SPARK_API_BASE = originalEnv;
    }
  });

  it('returns SPARK_API_BASE env var when set', () => {
    setEnv('https://custom.example.com');
    assert.strictEqual(getApiBase(), 'https://custom.example.com');
  });

  it('env var takes priority over settings files', () => {
    setEnv('https://env-override.example.com');
    // Even if local/global settings have apiBase, env var wins
    assert.strictEqual(getApiBase(), 'https://env-override.example.com');
  });

  it('strips trailing slashes from SPARK_API_BASE', () => {
    setEnv('https://custom.example.com///');
    assert.strictEqual(getApiBase(), 'https://custom.example.com');
  });

  it('skips SPARK_API_BASE when it is empty string', () => {
    setEnv('');
    assert.notStrictEqual(getApiBase(), '');
  });

  it('skips SPARK_API_BASE when it is whitespace only', () => {
    setEnv('   ');
    assert.notStrictEqual(getApiBase(), '');
  });

  it('skips SPARK_API_BASE when it is not a valid URL', () => {
    setEnv('not-a-url');
    assert.notStrictEqual(getApiBase(), 'not-a-url');
  });

  it('DEFAULT_API_BASE is the expected value', () => {
    assert.strictEqual(DEFAULT_API_BASE, 'https://spark.memco.ai');
  });
});

describe('getAuthSuccessUrl', () => {
  it('uses provided apiBase', () => {
    assert.strictEqual(
      getAuthSuccessUrl('https://custom.example.com'),
      'https://custom.example.com/cli/auth_success',
    );
  });

  it('falls back to getApiBase when no apiBase provided', () => {
    const url = getAuthSuccessUrl();
    assert.ok(url.endsWith('/cli/auth_success'));
  });
});

describe('getAuthErrorUrl', () => {
  it('uses provided apiBase', () => {
    assert.strictEqual(
      getAuthErrorUrl('https://custom.example.com'),
      'https://custom.example.com/cli/auth_error',
    );
  });

  it('falls back to getApiBase when no apiBase provided', () => {
    const url = getAuthErrorUrl();
    assert.ok(url.endsWith('/cli/auth_error'));
  });
});

describe('validateApiBase', () => {
  it('returns normalized URL for valid https URL', () => {
    assert.strictEqual(validateApiBase('https://example.com'), 'https://example.com');
  });

  it('returns normalized URL for valid http URL', () => {
    assert.strictEqual(validateApiBase('http://localhost:3000'), 'http://localhost:3000');
  });

  it('strips trailing slashes', () => {
    assert.strictEqual(validateApiBase('https://example.com///'), 'https://example.com');
  });

  it('trims whitespace', () => {
    assert.strictEqual(validateApiBase('  https://example.com  '), 'https://example.com');
  });

  it('returns undefined for empty string', () => {
    assert.strictEqual(validateApiBase(''), undefined);
  });

  it('returns undefined for whitespace-only string', () => {
    assert.strictEqual(validateApiBase('   '), undefined);
  });

  it('returns undefined for non-string values', () => {
    assert.strictEqual(validateApiBase(undefined), undefined);
    assert.strictEqual(validateApiBase(null), undefined);
    assert.strictEqual(validateApiBase(123), undefined);
  });

  it('returns undefined for invalid URL', () => {
    assert.strictEqual(validateApiBase('not-a-url'), undefined);
  });

  it('returns undefined for non-http(s) protocol', () => {
    assert.strictEqual(validateApiBase('ftp://example.com'), undefined);
    assert.strictEqual(validateApiBase('file:///etc/passwd'), undefined);
  });
});
