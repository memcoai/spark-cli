import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getApiBase, DEFAULT_API_BASE } from '../src/constants.js';

describe('getApiBase', () => {
  let originalEnv;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SPARK_API_BASE;
    } else {
      process.env.SPARK_API_BASE = originalEnv;
    }
    originalEnv = undefined;
  });

  it('returns SPARK_API_BASE env var when set', () => {
    originalEnv = process.env.SPARK_API_BASE;
    process.env.SPARK_API_BASE = 'https://custom.example.com';
    assert.strictEqual(getApiBase(), 'https://custom.example.com');
  });

  it('env var takes priority over settings files', () => {
    originalEnv = process.env.SPARK_API_BASE;
    process.env.SPARK_API_BASE = 'https://env-override.example.com';
    // Even if local/global settings have apiBase, env var wins
    assert.strictEqual(getApiBase(), 'https://env-override.example.com');
  });

  it('strips trailing slashes from SPARK_API_BASE', () => {
    originalEnv = process.env.SPARK_API_BASE;
    process.env.SPARK_API_BASE = 'https://custom.example.com///';
    assert.strictEqual(getApiBase(), 'https://custom.example.com');
  });

  it('DEFAULT_API_BASE is the expected value', () => {
    assert.strictEqual(DEFAULT_API_BASE, 'https://spark.memco.ai');
  });
});
