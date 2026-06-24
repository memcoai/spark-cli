import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { getAuthToken, getAuthMode, getCurrentUser } from '../src/api.js';
import { mockFetchSequence } from './helpers.js';

const BASE = 'https://spark.memco.ai';

describe('getAuthToken priority order', () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = process.env.SPARK_API_KEY;
    delete process.env.SPARK_API_KEY;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.SPARK_API_KEY;
    else process.env.SPARK_API_KEY = savedEnv;
  });

  it('prefers the CLI --api-key flag over everything', async () => {
    process.env.SPARK_API_KEY = 'env-key';
    const loadCreds = () => ({ apiKey: 'stored-key', accessToken: 'access' });
    const token = await getAuthToken(BASE, { apiKey: 'flag-key' }, { loadCreds });
    assert.strictEqual(token, 'flag-key');
  });

  it('prefers SPARK_API_KEY over stored credentials', async () => {
    process.env.SPARK_API_KEY = 'env-key';
    const loadCreds = () => ({ apiKey: 'stored-key', accessToken: 'access' });
    const token = await getAuthToken(BASE, {}, { loadCreds });
    assert.strictEqual(token, 'env-key');
  });

  it('prefers a stored api key over a stored OAuth access token', async () => {
    const loadCreds = () => ({ apiKey: 'stored-key', accessToken: 'access' });
    const token = await getAuthToken(BASE, {}, { loadCreds });
    assert.strictEqual(token, 'stored-key');
  });

  it('falls back to the legacy stored token field', async () => {
    const loadCreds = () => ({ token: 'legacy-token' });
    const token = await getAuthToken(BASE, {}, { loadCreds });
    assert.strictEqual(token, 'legacy-token');
  });

  it('returns the stored OAuth access token when no api key is present', async () => {
    const loadCreds = () => ({ accessToken: 'oauth-access' });
    const token = await getAuthToken(BASE, {}, { loadCreds });
    assert.strictEqual(token, 'oauth-access');
  });

  it('returns null when nothing is available (no throw)', async () => {
    const loadCreds = () => null;
    const token = await getAuthToken(BASE, {}, { loadCreds });
    assert.strictEqual(token, null);
  });

  it('does NOT proactively refresh (no refresh seam, expired token returned as-is)', async () => {
    // Expired accessToken with a refreshToken — must still be returned unchanged.
    const loadCreds = () => ({ accessToken: 'expired-access', refreshToken: 'rt', expiresAt: 1 });
    const token = await getAuthToken(BASE, {}, { loadCreds });
    assert.strictEqual(token, 'expired-access');
  });
});

describe('getAuthMode', () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = process.env.SPARK_API_KEY;
    delete process.env.SPARK_API_KEY;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.SPARK_API_KEY;
    else process.env.SPARK_API_KEY = savedEnv;
  });

  it("returns 'apikey' for the CLI --api-key flag", () => {
    const loadCreds = () => ({ accessToken: 'access' });
    assert.strictEqual(getAuthMode(BASE, { apiKey: 'flag' }, { loadCreds }), 'apikey');
  });

  it("returns 'apikey' for SPARK_API_KEY", () => {
    process.env.SPARK_API_KEY = 'env-key';
    const loadCreds = () => ({ accessToken: 'access' });
    assert.strictEqual(getAuthMode(BASE, {}, { loadCreds }), 'apikey');
  });

  it("returns 'apikey' for a stored legacy api key", () => {
    const loadCreds = () => ({ apiKey: 'stored-key' });
    assert.strictEqual(getAuthMode(BASE, {}, { loadCreds }), 'apikey');
  });

  it("returns 'oauth' when only OAuth credentials exist", () => {
    const loadCreds = () => ({ accessToken: 'oauth-access', refreshToken: 'rt' });
    assert.strictEqual(getAuthMode(BASE, {}, { loadCreds }), 'oauth');
  });

  it('returns null when no credentials exist', () => {
    const loadCreds = () => null;
    assert.strictEqual(getAuthMode(BASE, {}, { loadCreds }), null);
  });
});

describe('getCurrentUser', () => {
  let savedEnv;
  beforeEach(() => {
    savedEnv = process.env.SPARK_API_KEY;
    delete process.env.SPARK_API_KEY;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.SPARK_API_KEY;
    else process.env.SPARK_API_KEY = savedEnv;
  });

  it('happy path: GET 200 returns the parsed user', async () => {
    const doFetch = mockFetchSequence([{ status: 200, json: { user: { id: 'u1' } } }]);
    const result = await getCurrentUser(
      BASE,
      {},
      {
        getAuth: async () => 'tok',
        getMode: () => 'oauth',
        doFetch,
      },
    );

    assert.deepStrictEqual(result, { user: { id: 'u1' } });
    assert.strictEqual(doFetch.calls.length, 1);
    assert.strictEqual(doFetch.calls[0].url, `${BASE}/api/internal/v1/user`);
    assert.strictEqual(doFetch.calls[0].options.method, 'GET');
    assert.strictEqual(doFetch.calls[0].options.headers.Authorization, 'Bearer tok');
  });

  it('throws the login hint when not authenticated', async () => {
    await assert.rejects(
      () => getCurrentUser(BASE, {}, { getAuth: async () => null, getMode: () => null }),
      { message: /Not authenticated\. Please run 'spark login' first\./ },
    );
  });

  it('api-key 401 → no refresh, no retry → throws API error', async () => {
    const doFetch = mockFetchSequence([{ status: 401, text: 'Unauthorized' }]);
    let runAuthCalls = 0;
    const runAuth = async () => {
      runAuthCalls += 1;
      return 'AUTHORIZED';
    };

    await assert.rejects(
      () =>
        getCurrentUser(
          BASE,
          {},
          {
            getAuth: async () => 'key-123',
            getMode: () => 'apikey',
            doFetch,
            runAuth,
          },
        ),
      { message: /API error \(401\): Unauthorized/ },
    );
    assert.strictEqual(runAuthCalls, 0);
    assert.strictEqual(doFetch.calls.length, 1);
  });

  it('throws on non-2xx (non-401) without retrying', async () => {
    const doFetch = mockFetchSequence([{ status: 500, text: 'Server Error' }]);
    let runAuthCalls = 0;
    await assert.rejects(
      () =>
        getCurrentUser(
          BASE,
          {},
          {
            getAuth: async () => 'tok',
            getMode: () => 'oauth',
            doFetch,
            runAuth: async () => {
              runAuthCalls += 1;
              return 'AUTHORIZED';
            },
          },
        ),
      { message: /API error \(500\): Server Error/ },
    );
    assert.strictEqual(runAuthCalls, 0);
    assert.strictEqual(doFetch.calls.length, 1);
  });

  it('throws a validation error when the response shape is invalid', async () => {
    // toolResponseSchema is loose, so force a failure with a strict schema seam.
    const doFetch = mockFetchSequence([{ status: 200, json: { wrong: true } }]);
    const schema = {
      safeParse: () => ({
        success: false,
        error: { issues: [{ path: ['user'], message: 'Required' }] },
      }),
    };
    await assert.rejects(
      () =>
        getCurrentUser(
          BASE,
          {},
          {
            getAuth: async () => 'tok',
            getMode: () => 'oauth',
            doFetch,
            schema,
          },
        ),
      {
        message:
          /API response validation failed for GET .*\/api\/internal\/v1\/user \(200\): user: Required/,
      },
    );
  });

  it('back-compat: accepts a commander command as the 2nd arg and reads --api-key', async () => {
    const doFetch = mockFetchSequence([{ status: 200, json: { user: { id: 'u1' } } }]);
    let getAuthApiKey;
    const command = { parent: null, opts: () => ({ apiKey: 'flag-key' }) };
    const result = await getCurrentUser(BASE, command, {
      getAuth: async (_base, opts) => {
        getAuthApiKey = opts.apiKey;
        return 'tok';
      },
      getMode: () => 'apikey',
      doFetch,
    });

    assert.deepStrictEqual(result, { user: { id: 'u1' } });
    assert.strictEqual(getAuthApiKey, 'flag-key');
  });

  it('isCommand gating: a plain options bag with parent:null is NOT treated as a command', async () => {
    // Regression: the old `parent !== undefined` heuristic misrouted an options
    // bag carrying `parent: null`, dropping its `--api-key`. The bag's apiKey
    // must reach getAuth (it is options, not a commander command).
    const doFetch = mockFetchSequence([{ status: 200, json: { user: { id: 'u1' } } }]);
    let seenApiKey = 'UNSET';
    const optionsBag = { apiKey: 'bag-key', parent: null };
    const result = await getCurrentUser(BASE, optionsBag, {
      getAuth: async (_base, opts) => {
        seenApiKey = opts.apiKey;
        return 'tok';
      },
      getMode: () => 'apikey',
      doFetch,
    });

    assert.deepStrictEqual(result, { user: { id: 'u1' } });
    // Read straight from the bag — NOT from a (non-existent) parent command.
    assert.strictEqual(seenApiKey, 'bag-key');
  });

  it('oauth 401 → auth() AUTHORIZED → retries with the refreshed token', async () => {
    const doFetch = mockFetchSequence([
      { status: 401, text: 'Unauthorized' },
      { status: 200, json: { user: { id: 'u1' } } },
    ]);
    let runAuthCalls = 0;
    const result = await getCurrentUser(
      BASE,
      {},
      {
        getAuth: async () => 'stale-tok',
        getMode: () => 'oauth',
        doFetch,
        loadCreds: () => ({ credentials: { accessToken: 'x' }, local: false }),
        runAuth: async () => {
          runAuthCalls += 1;
          return 'AUTHORIZED';
        },
        makeProvider: () => ({ tokens: () => ({ access_token: 'fresh-tok' }) }),
      },
    );

    assert.deepStrictEqual(result, { user: { id: 'u1' } });
    assert.strictEqual(runAuthCalls, 1);
    assert.strictEqual(doFetch.calls.length, 2);
    // The retry used the refreshed token, not the stale one.
    assert.strictEqual(doFetch.calls[1].options.headers.Authorization, 'Bearer fresh-tok');
  });

  it('oauth 401 → auth() not AUTHORIZED → surfaces session-expired (no stale retry)', async () => {
    const doFetch = mockFetchSequence([{ status: 401, text: 'Unauthorized' }]);
    await assert.rejects(
      () =>
        getCurrentUser(
          BASE,
          {},
          {
            getAuth: async () => 'stale-tok',
            getMode: () => 'oauth',
            doFetch,
            loadCreds: () => ({ credentials: { accessToken: 'x' }, local: false }),
            // auth() returns REDIRECT (would-be browser) — must NOT retry.
            runAuth: async () => 'REDIRECT',
            makeProvider: () => ({ tokens: () => undefined }),
          },
        ),
      { message: /Session expired\. Please run 'spark login' again\./ },
    );
    assert.strictEqual(doFetch.calls.length, 1);
  });

  it('oauth 401 → auth() throws → surfaces session-expired (not raw 401)', async () => {
    const doFetch = mockFetchSequence([{ status: 401, text: 'Unauthorized' }]);
    await assert.rejects(
      () =>
        getCurrentUser(
          BASE,
          {},
          {
            getAuth: async () => 'stale-tok',
            getMode: () => 'oauth',
            doFetch,
            loadCreds: () => ({ credentials: { accessToken: 'x' }, local: true }),
            runAuth: async () => {
              throw new Error("Session expired. Please run 'spark login' again.");
            },
            makeProvider: () => ({ tokens: () => undefined }),
          },
        ),
      { message: /Session expired\. Please run 'spark login' again\./ },
    );
    assert.strictEqual(doFetch.calls.length, 1);
  });

  it('oauth 401 refresh threads { local } from the credential source to the provider', async () => {
    const doFetch = mockFetchSequence([
      { status: 401, text: 'Unauthorized' },
      { status: 200, json: { user: { id: 'u1' } } },
    ]);
    let providerOpts;
    await getCurrentUser(
      BASE,
      {},
      {
        getAuth: async () => 'stale-tok',
        getMode: () => 'oauth',
        doFetch,
        loadCreds: () => ({ credentials: { accessToken: 'x' }, local: true }),
        runAuth: async () => 'AUTHORIZED',
        makeProvider: (_base, opts) => {
          providerOpts = opts;
          return { tokens: () => ({ access_token: 'fresh-tok' }) };
        },
      },
    );
    assert.deepStrictEqual(providerOpts, { local: true });
  });
});
