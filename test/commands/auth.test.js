import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupCommandMocks, getLogOutput } from '../helpers.js';
import { checkExistingAuth, resolveApiBase } from '../../src/commands/auth.js';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH } from '../../src/constants.js';

describe('checkExistingAuth', () => {
  const mocks = setupCommandMocks();

  const baseDeps = {
    loadCreds: () => null,
    loadLocalCreds: () => null,
    isExpired: () => false,
    refresh: async () => {},
    removeCreds: () => {},
    getUser: async () => ({}),
  };

  it('returns continue when no credentials exist', async () => {
    const result = await checkExistingAuth({}, undefined, { ...baseDeps });
    assert.strictEqual(result, 'continue');
  });

  it('returns skip when valid access token exists', async () => {
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ accessToken: 'tok' }),
    });
    assert.strictEqual(result, 'skip');
    assert.match(getLogOutput(mocks.logMock), /already logged in/);
  });

  it('returns skip when api key exists', async () => {
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ apiKey: 'key123' }),
    });
    assert.strictEqual(result, 'skip');
    assert.match(getLogOutput(mocks.logMock), /already logged in/);
  });

  it('returns skip after successful token refresh', async () => {
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ accessToken: 'tok', refreshToken: 'ref' }),
      isExpired: () => true,
      refresh: async () => {},
    });
    assert.strictEqual(result, 'skip');
    assert.match(getLogOutput(mocks.logMock), /session has been refreshed/);
  });

  it('returns continue and removes credentials when refresh fails', async () => {
    let removeCalled = false;
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ accessToken: 'tok', refreshToken: 'ref' }),
      isExpired: () => true,
      refresh: async () => {
        throw new Error('refresh failed');
      },
      removeCreds: () => {
        removeCalled = true;
      },
    });
    assert.strictEqual(result, 'continue');
    assert.strictEqual(removeCalled, true);
  });

  it('uses loadLocalCreds when --local flag is set', async () => {
    let localCalled = false;
    let globalCalled = false;
    await checkExistingAuth({ local: true }, undefined, {
      ...baseDeps,
      loadCreds: () => {
        globalCalled = true;
        return null;
      },
      loadLocalCreds: () => {
        localCalled = true;
        return null;
      },
    });
    assert.strictEqual(localCalled, true);
    assert.strictEqual(globalCalled, false);
  });

  it('uses loadCreds when --local flag is not set', async () => {
    let globalCalled = false;
    let localCalled = false;
    await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => {
        globalCalled = true;
        return null;
      },
      loadLocalCreds: () => {
        localCalled = true;
        return null;
      },
    });
    assert.strictEqual(globalCalled, true);
    assert.strictEqual(localCalled, false);
  });

  it('returns continue and removes credentials when refresh succeeds but getUser fails', async () => {
    let removeCalled = false;
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ accessToken: 'tok', refreshToken: 'ref' }),
      isExpired: () => true,
      refresh: async () => {},
      getUser: async () => {
        throw new Error('unauthorized');
      },
      removeCreds: () => {
        removeCalled = true;
      },
    });
    assert.strictEqual(result, 'continue');
    assert.strictEqual(removeCalled, true);
  });
});

describe('resolveApiBase', () => {
  const mocks = setupCommandMocks();

  const baseDeps = {
    validate: (url) => (url.startsWith('http') ? url.replace(/\/+$/, '') : undefined),
    getBase: () => 'https://spark.memco.ai',
    writeKey: mock.fn(),
  };

  it('returns default apiBase when no --api-base option is provided', () => {
    const result = resolveApiBase({}, { ...baseDeps });
    assert.strictEqual(result, 'https://spark.memco.ai');
  });

  it('exits with error for invalid --api-base URL', () => {
    const deps = { ...baseDeps, validate: () => undefined };

    resolveApiBase({ apiBase: 'not-a-url' }, deps);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);
    assert.match(getLogOutput(mocks.logMock), /Invalid API base URL/);
  });

  it('writes apiBase to global settings by default', () => {
    const writeKey = mock.fn();
    const deps = { ...baseDeps, writeKey };

    const result = resolveApiBase({ apiBase: 'https://custom.example.com' }, deps);

    assert.strictEqual(result, 'https://custom.example.com');
    assert.strictEqual(writeKey.mock.calls.length, 1);
    assert.strictEqual(writeKey.mock.calls[0].arguments[0], SETTINGS_PATH);
    assert.strictEqual(writeKey.mock.calls[0].arguments[1], 'apiBase');
    assert.strictEqual(writeKey.mock.calls[0].arguments[2], 'https://custom.example.com');
  });

  it('writes apiBase to local settings when --local flag is set', () => {
    const writeKey = mock.fn();
    const deps = { ...baseDeps, writeKey };

    const result = resolveApiBase({ apiBase: 'https://custom.example.com', local: true }, deps);

    assert.strictEqual(result, 'https://custom.example.com');
    assert.strictEqual(writeKey.mock.calls.length, 1);
    assert.strictEqual(writeKey.mock.calls[0].arguments[0], LOCAL_SETTINGS_PATH);
  });

  it('does not write to settings when no --api-base is provided', () => {
    const writeKey = mock.fn();
    const deps = { ...baseDeps, writeKey };

    resolveApiBase({}, deps);

    assert.strictEqual(writeKey.mock.calls.length, 0);
  });

  it('uses the validated/normalized URL from validate', () => {
    const writeKey = mock.fn();
    const deps = {
      ...baseDeps,
      validate: () => 'https://normalized.example.com',
      writeKey,
    };

    const result = resolveApiBase({ apiBase: 'https://normalized.example.com///' }, deps);

    assert.strictEqual(result, 'https://normalized.example.com');
    assert.strictEqual(writeKey.mock.calls[0].arguments[2], 'https://normalized.example.com');
  });
});
