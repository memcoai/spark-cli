import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupCommandMocks, getLogOutput } from '../helpers.js';
import { checkExistingAuth } from '../../src/commands/auth.js';

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
    const result = await checkExistingAuth({}, { ...baseDeps });
    assert.strictEqual(result, 'continue');
  });

  it('returns skip when valid access token exists', async () => {
    const result = await checkExistingAuth(
      {},
      { ...baseDeps, loadCreds: () => ({ accessToken: 'tok' }) },
    );
    assert.strictEqual(result, 'skip');
    assert.match(getLogOutput(mocks.logMock), /already logged in/);
  });

  it('returns skip when api key exists', async () => {
    const result = await checkExistingAuth(
      {},
      { ...baseDeps, loadCreds: () => ({ apiKey: 'key123' }) },
    );
    assert.strictEqual(result, 'skip');
    assert.match(getLogOutput(mocks.logMock), /already logged in/);
  });

  it('returns skip after successful token refresh', async () => {
    const result = await checkExistingAuth(
      {},
      {
        ...baseDeps,
        loadCreds: () => ({ accessToken: 'tok', refreshToken: 'ref' }),
        isExpired: () => true,
        refresh: async () => {},
      },
    );
    assert.strictEqual(result, 'skip');
    assert.match(getLogOutput(mocks.logMock), /session has been refreshed/);
  });

  it('returns continue and removes credentials when refresh fails', async () => {
    let removeCalled = false;
    const result = await checkExistingAuth(
      {},
      {
        ...baseDeps,
        loadCreds: () => ({ accessToken: 'tok', refreshToken: 'ref' }),
        isExpired: () => true,
        refresh: async () => {
          throw new Error('refresh failed');
        },
        removeCreds: () => {
          removeCalled = true;
        },
      },
    );
    assert.strictEqual(result, 'continue');
    assert.strictEqual(removeCalled, true);
  });

  it('uses loadLocalCreds when --local flag is set', async () => {
    let localCalled = false;
    let globalCalled = false;
    await checkExistingAuth(
      { local: true },
      {
        ...baseDeps,
        loadCreds: () => {
          globalCalled = true;
          return null;
        },
        loadLocalCreds: () => {
          localCalled = true;
          return null;
        },
      },
    );
    assert.strictEqual(localCalled, true);
    assert.strictEqual(globalCalled, false);
  });

  it('uses loadCreds when --local flag is not set', async () => {
    let globalCalled = false;
    let localCalled = false;
    await checkExistingAuth(
      {},
      {
        ...baseDeps,
        loadCreds: () => {
          globalCalled = true;
          return null;
        },
        loadLocalCreds: () => {
          localCalled = true;
          return null;
        },
      },
    );
    assert.strictEqual(globalCalled, true);
    assert.strictEqual(localCalled, false);
  });

  it('returns continue and removes credentials when refresh succeeds but getUser fails', async () => {
    let removeCalled = false;
    const result = await checkExistingAuth(
      {},
      {
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
      },
    );
    assert.strictEqual(result, 'continue');
    assert.strictEqual(removeCalled, true);
  });
});
