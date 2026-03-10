import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTokenExpired,
  loadCredentials,
  loadLocalCredentials,
  saveCredentials,
  removeCredentials,
  credentialsExist,
} from '../src/credentials.js';
import { DEFAULT_API_BASE, SETTINGS_PATH, LOCAL_SETTINGS_PATH } from '../src/constants.js';

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

/** Helper to build mock deps for credential functions. */
function makeDeps(store = {}) {
  return {
    readKey: mock.fn((path, key) => store[path]?.[key] ?? null),
    writeKey: mock.fn((path, key, value) => {
      if (!store[path]) store[path] = {};
      store[path][key] = value;
    }),
    getBase: () => DEFAULT_API_BASE,
    exists: () => false,
  };
}

describe('migrateCredentials (via loadCredentials)', () => {
  it('migrates flat accessToken credentials under DEFAULT_API_BASE', () => {
    const flat = { accessToken: 'tok', refreshToken: 'ref' };
    const store = { [SETTINGS_PATH]: { credentials: flat } };
    const deps = makeDeps(store);

    const result = loadCredentials(undefined, deps);

    assert.deepStrictEqual(result, flat);
    // Verify migration was written back
    const writeCall = deps.writeKey.mock.calls.find(
      (c) => c.arguments[0] === SETTINGS_PATH && c.arguments[1] === 'credentials',
    );
    assert.ok(writeCall, 'should write migrated credentials');
    assert.deepStrictEqual(writeCall.arguments[2], { [DEFAULT_API_BASE]: flat });
  });

  it('migrates flat apiKey credentials under DEFAULT_API_BASE', () => {
    const flat = { apiKey: 'key123' };
    const store = { [SETTINGS_PATH]: { credentials: flat } };
    const deps = makeDeps(store);

    const result = loadCredentials(undefined, deps);

    assert.deepStrictEqual(result, flat);
  });

  it('migrates flat token credentials under DEFAULT_API_BASE', () => {
    const flat = { token: 'legacy-tok' };
    const store = { [SETTINGS_PATH]: { credentials: flat } };
    const deps = makeDeps(store);

    const result = loadCredentials(undefined, deps);

    assert.deepStrictEqual(result, flat);
  });

  it('does not migrate already per-URL credentials', () => {
    const perUrl = { [DEFAULT_API_BASE]: { accessToken: 'tok' } };
    const store = { [SETTINGS_PATH]: { credentials: perUrl } };
    const deps = makeDeps(store);

    const result = loadCredentials(undefined, deps);

    assert.deepStrictEqual(result, { accessToken: 'tok' });
    // writeKey should not be called for migration (only readKey calls)
    const migrationWrite = deps.writeKey.mock.calls.find((c) => c.arguments[1] === 'credentials');
    assert.strictEqual(migrationWrite, undefined);
  });
});

describe('loadCredentials', () => {
  it('returns null when no credentials exist', () => {
    const deps = makeDeps();
    assert.strictEqual(loadCredentials(undefined, deps), null);
  });

  it('returns credentials keyed by apiBase URL', () => {
    const creds = { accessToken: 'tok' };
    const store = {
      [SETTINGS_PATH]: { credentials: { 'https://custom.example.com': creds } },
    };
    const deps = makeDeps(store);

    const result = loadCredentials('https://custom.example.com', deps);

    assert.deepStrictEqual(result, creds);
  });

  it('normalizes trailing slashes on apiBase lookup', () => {
    const creds = { accessToken: 'tok' };
    const store = {
      [SETTINGS_PATH]: { credentials: { 'https://custom.example.com': creds } },
    };
    const deps = makeDeps(store);

    const result = loadCredentials('https://custom.example.com///', deps);

    assert.deepStrictEqual(result, creds);
  });

  it('checks local before global', () => {
    const localCreds = { accessToken: 'local-tok' };
    const globalCreds = { accessToken: 'global-tok' };
    const store = {
      [LOCAL_SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: localCreds } },
      [SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: globalCreds } },
    };
    const deps = makeDeps(store);

    const result = loadCredentials(undefined, deps);

    assert.deepStrictEqual(result, localCreds);
  });

  it('falls back to global when local has no match', () => {
    const globalCreds = { accessToken: 'global-tok' };
    const store = {
      [LOCAL_SETTINGS_PATH]: { credentials: { 'https://other.example.com': { accessToken: 'x' } } },
      [SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: globalCreds } },
    };
    const deps = makeDeps(store);

    const result = loadCredentials(undefined, deps);

    assert.deepStrictEqual(result, globalCreds);
  });

  it('returns withSource=true with local: true for local credentials', () => {
    const creds = { accessToken: 'tok' };
    const store = {
      [LOCAL_SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: creds } },
    };
    const deps = makeDeps(store);

    const result = loadCredentials(undefined, { withSource: true, ...deps });

    assert.deepStrictEqual(result, { credentials: creds, local: true });
  });

  it('returns withSource=true with local: false for global credentials', () => {
    const creds = { accessToken: 'tok' };
    const store = {
      [SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: creds } },
    };
    const deps = makeDeps(store);

    const result = loadCredentials(undefined, { withSource: true, ...deps });

    assert.deepStrictEqual(result, { credentials: creds, local: false });
  });

  it('returns { credentials: null, local: false } with withSource when nothing found', () => {
    const deps = makeDeps();

    const result = loadCredentials(undefined, { withSource: true, ...deps });

    assert.deepStrictEqual(result, { credentials: null, local: false });
  });

  it('falls back to getBase when apiBase is not provided', () => {
    const creds = { accessToken: 'tok' };
    const store = {
      [SETTINGS_PATH]: { credentials: { 'https://custom.base.com': creds } },
    };
    const deps = { ...makeDeps(store), getBase: () => 'https://custom.base.com' };

    const result = loadCredentials(undefined, deps);

    assert.deepStrictEqual(result, creds);
  });
});

describe('loadLocalCredentials', () => {
  it('returns null when no local credentials exist', () => {
    const deps = makeDeps();
    assert.strictEqual(loadLocalCredentials(undefined, deps), null);
  });

  it('returns credentials from local settings only', () => {
    const creds = { accessToken: 'local-tok' };
    const store = {
      [LOCAL_SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: creds } },
      [SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: { accessToken: 'global-tok' } } },
    };
    const deps = makeDeps(store);

    const result = loadLocalCredentials(undefined, deps);

    assert.deepStrictEqual(result, creds);
  });

  it('does not fall back to global settings', () => {
    const store = {
      [SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: { accessToken: 'global-tok' } } },
    };
    const deps = makeDeps(store);

    const result = loadLocalCredentials(undefined, deps);

    assert.strictEqual(result, null);
  });
});

describe('saveCredentials', () => {
  it('saves credentials keyed by apiBase to global settings', () => {
    const store = {};
    const deps = makeDeps(store);

    saveCredentials({ accessToken: 'new-tok' }, { apiBase: 'https://example.com', ...deps });

    assert.deepStrictEqual(store[SETTINGS_PATH].credentials, {
      'https://example.com': { accessToken: 'new-tok' },
    });
  });

  it('saves to local settings when local: true', () => {
    const store = {};
    const deps = makeDeps(store);

    saveCredentials({ accessToken: 'tok' }, { local: true, ...deps });

    assert.ok(store[LOCAL_SETTINGS_PATH]?.credentials?.[DEFAULT_API_BASE]);
  });

  it('saves to global settings when local: false', () => {
    const store = {};
    const deps = makeDeps(store);

    saveCredentials({ accessToken: 'tok' }, { local: false, ...deps });

    assert.ok(store[SETTINGS_PATH]?.credentials?.[DEFAULT_API_BASE]);
  });

  it('auto-detects local when local settings file exists', () => {
    const store = {};
    const deps = { ...makeDeps(store), exists: () => true };

    saveCredentials({ accessToken: 'tok' }, deps);

    assert.ok(store[LOCAL_SETTINGS_PATH]?.credentials?.[DEFAULT_API_BASE]);
  });

  it('merges with existing per-URL credentials', () => {
    const store = {
      [SETTINGS_PATH]: {
        credentials: { 'https://other.com': { accessToken: 'other-tok' } },
      },
    };
    const deps = makeDeps(store);

    saveCredentials({ accessToken: 'new-tok' }, deps);

    assert.deepStrictEqual(store[SETTINGS_PATH].credentials, {
      'https://other.com': { accessToken: 'other-tok' },
      [DEFAULT_API_BASE]: { accessToken: 'new-tok' },
    });
  });

  it('migrates flat credentials during save', () => {
    const flat = { accessToken: 'old-tok', refreshToken: 'old-ref' };
    const store = { [SETTINGS_PATH]: { credentials: flat } };
    const deps = makeDeps(store);

    saveCredentials({ accessToken: 'new-tok' }, { apiBase: 'https://custom.com', ...deps });

    const saved = store[SETTINGS_PATH].credentials;
    assert.deepStrictEqual(saved[DEFAULT_API_BASE], flat);
    assert.deepStrictEqual(saved['https://custom.com'], { accessToken: 'new-tok' });
  });

  it('normalizes trailing slashes on apiBase', () => {
    const store = {};
    const deps = makeDeps(store);

    saveCredentials({ accessToken: 'tok' }, { apiBase: 'https://example.com///', ...deps });

    assert.ok(store[SETTINGS_PATH].credentials['https://example.com']);
  });
});

describe('credentialsExist', () => {
  it('returns false when no credentials exist', () => {
    const deps = makeDeps();
    assert.strictEqual(credentialsExist(undefined, deps), false);
  });

  it('returns true when credentials exist for the default apiBase', () => {
    const store = {
      [SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: { accessToken: 'tok' } } },
    };
    const deps = makeDeps(store);

    assert.strictEqual(credentialsExist(undefined, deps), true);
  });

  it('returns true when credentials exist for a custom apiBase', () => {
    const store = {
      [SETTINGS_PATH]: { credentials: { 'https://custom.com': { accessToken: 'tok' } } },
    };
    const deps = makeDeps(store);

    assert.strictEqual(credentialsExist('https://custom.com', deps), true);
  });

  it('returns false when credentials exist for a different apiBase', () => {
    const store = {
      [SETTINGS_PATH]: { credentials: { 'https://other.com': { accessToken: 'tok' } } },
    };
    const deps = makeDeps(store);

    assert.strictEqual(credentialsExist('https://custom.com', deps), false);
  });

  it('checks local before global', () => {
    const store = {
      [LOCAL_SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: { accessToken: 'tok' } } },
    };
    const deps = makeDeps(store);

    assert.strictEqual(credentialsExist(undefined, deps), true);
  });
});

describe('removeCredentials', () => {
  it('returns null when no credentials exist', () => {
    const deps = makeDeps();
    assert.strictEqual(removeCredentials(undefined, deps), null);
  });

  it('removes credentials from local settings and returns "local"', () => {
    const store = {
      [LOCAL_SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: { accessToken: 'tok' } } },
    };
    const deps = makeDeps(store);

    const result = removeCredentials(undefined, deps);

    assert.strictEqual(result, 'local');
  });

  it('removes credentials from global settings and returns "global"', () => {
    const store = {
      [SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: { accessToken: 'tok' } } },
    };
    const deps = makeDeps(store);

    const result = removeCredentials(undefined, deps);

    assert.strictEqual(result, 'global');
  });

  it('prefers removing from local over global', () => {
    const store = {
      [LOCAL_SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: { accessToken: 'local' } } },
      [SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: { accessToken: 'global' } } },
    };
    const deps = makeDeps(store);

    const result = removeCredentials(undefined, deps);

    assert.strictEqual(result, 'local');
    // Global should still exist
    assert.deepStrictEqual(store[SETTINGS_PATH].credentials[DEFAULT_API_BASE], {
      accessToken: 'global',
    });
  });

  it('nulls out credentials key when last URL entry is removed', () => {
    const store = {
      [SETTINGS_PATH]: { credentials: { [DEFAULT_API_BASE]: { accessToken: 'tok' } } },
    };
    const deps = makeDeps(store);

    removeCredentials(undefined, deps);

    const writeCall = deps.writeKey.mock.calls.find(
      (c) => c.arguments[0] === SETTINGS_PATH && c.arguments[1] === 'credentials',
    );
    assert.strictEqual(writeCall.arguments[2], null);
  });

  it('preserves other URL entries when removing one', () => {
    const store = {
      [SETTINGS_PATH]: {
        credentials: {
          [DEFAULT_API_BASE]: { accessToken: 'default-tok' },
          'https://other.com': { accessToken: 'other-tok' },
        },
      },
    };
    const deps = makeDeps(store);

    removeCredentials(undefined, deps);

    assert.deepStrictEqual(store[SETTINGS_PATH].credentials, {
      'https://other.com': { accessToken: 'other-tok' },
    });
  });

  it('removes credentials for a specific apiBase', () => {
    const store = {
      [SETTINGS_PATH]: {
        credentials: {
          [DEFAULT_API_BASE]: { accessToken: 'default-tok' },
          'https://custom.com': { accessToken: 'custom-tok' },
        },
      },
    };
    const deps = makeDeps(store);

    const result = removeCredentials('https://custom.com', deps);

    assert.strictEqual(result, 'global');
    assert.ok(store[SETTINGS_PATH].credentials[DEFAULT_API_BASE]);
    assert.strictEqual(store[SETTINGS_PATH].credentials['https://custom.com'], undefined);
  });
});
