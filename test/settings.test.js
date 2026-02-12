import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readSettings, writeSettings, readSettingsKey, writeSettingsKey } from '../src/settings.js';

function createTempDir() {
  return mkdtempSync(join(tmpdir(), 'spark-test-'));
}

describe('settings', () => {
  const tempDirs = [];

  function tempSettingsPath() {
    const dir = createTempDir();
    tempDirs.push(dir);
    return join(dir, 'settings.json');
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  describe('readSettings', () => {
    it('returns null for nonexistent file', () => {
      assert.strictEqual(readSettings('/tmp/nonexistent-spark-test/settings.json'), null);
    });

    it('returns parsed object for valid file', () => {
      const path = tempSettingsPath();
      writeSettings(path, { credentials: { token: 'abc' } });
      const result = readSettings(path);
      assert.deepStrictEqual(result, { credentials: { token: 'abc' } });
    });
  });

  describe('writeSettings', () => {
    it('creates directory and writes file', () => {
      const dir = createTempDir();
      tempDirs.push(dir);
      const nested = join(dir, 'sub', 'settings.json');
      writeSettings(nested, { key: 'value' });
      const content = JSON.parse(readFileSync(nested, 'utf8'));
      assert.deepStrictEqual(content, { key: 'value' });
    });

    it('writes file with restricted permissions', () => {
      const path = tempSettingsPath();
      writeSettings(path, {});
      const stats = statSync(path);
      const mode = stats.mode & 0o777;
      assert.strictEqual(mode, 0o600);
    });
  });

  describe('readSettingsKey', () => {
    it('returns null when file does not exist', () => {
      assert.strictEqual(readSettingsKey('/tmp/nonexistent-spark-test/settings.json', 'key'), null);
    });

    it('returns null when key is missing', () => {
      const path = tempSettingsPath();
      writeSettings(path, { other: 'data' });
      assert.strictEqual(readSettingsKey(path, 'credentials'), null);
    });

    it('returns value when key exists', () => {
      const path = tempSettingsPath();
      writeSettings(path, { credentials: { token: 'x' } });
      assert.deepStrictEqual(readSettingsKey(path, 'credentials'), { token: 'x' });
    });
  });

  describe('writeSettingsKey', () => {
    it('creates file and sets key when file does not exist', () => {
      const path = tempSettingsPath();
      writeSettingsKey(path, 'credentials', { token: 'new' });
      assert.deepStrictEqual(readSettings(path), { credentials: { token: 'new' } });
    });

    it('merges into existing settings', () => {
      const path = tempSettingsPath();
      writeSettings(path, { client: { id: '123' } });
      writeSettingsKey(path, 'credentials', { token: 'abc' });
      const result = readSettings(path);
      assert.deepStrictEqual(result, {
        client: { id: '123' },
        credentials: { token: 'abc' },
      });
    });

    it('removes key when value is null', () => {
      const path = tempSettingsPath();
      writeSettings(path, { credentials: { token: 'x' }, client: { id: '1' } });
      writeSettingsKey(path, 'credentials', null);
      assert.deepStrictEqual(readSettings(path), { client: { id: '1' } });
    });
  });
});
