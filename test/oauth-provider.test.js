import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SparkOAuthProvider } from '../src/oauth-provider.js';
import { CALLBACK_PORT } from '../src/constants.js';

const API_BASE = 'https://spark.memco.ai';
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

/**
 * Build a provider whose non-pure deps are all stubbed/recorded.
 * Returns { provider, deps, store } where `store` lets tests prime/inspect state.
 */
function makeProvider({ apiBase = API_BASE, local, interactive, store = {} } = {}) {
  store.credentials = store.credentials ?? null;
  store.client = store.client ?? null;
  store.savedTokens = [];
  store.savedClients = [];
  store.removed = [];
  store.opened = [];

  const deps = {
    loadCredentials: mock.fn(() => store.credentials),
    saveCredentials: mock.fn((creds, opts) => {
      store.savedTokens.push({ creds, opts });
      store.credentials = creds;
    }),
    removeCredentials: mock.fn((base) => {
      store.removed.push(base);
    }),
    loadClient: mock.fn(() => store.client),
    saveClient: mock.fn((info, base) => {
      store.savedClients.push({ info, base });
      store.client = info;
    }),
    open: mock.fn(async (url) => {
      store.opened.push(url);
    }),
  };

  const provider = new SparkOAuthProvider(apiBase, { local, interactive, deps });
  return { provider, deps, store };
}

describe('SparkOAuthProvider — static metadata', () => {
  it('exposes the loopback redirectUrl', () => {
    const { provider } = makeProvider();
    assert.strictEqual(provider.redirectUrl, REDIRECT_URI);
  });

  it('returns RFC 7591 client metadata for a public client', () => {
    const { provider } = makeProvider();
    assert.deepStrictEqual(provider.clientMetadata, {
      client_name: 'spark-cli',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  it('normalizes the apiBase (strips trailing slashes)', () => {
    const { provider } = makeProvider({ apiBase: 'https://spark.memco.ai///' });
    assert.strictEqual(provider.apiBase, API_BASE);
  });
});

describe('SparkOAuthProvider — state()', () => {
  it('returns a stable per-instance value', () => {
    const { provider } = makeProvider();
    const first = provider.state();
    assert.match(first, /^[0-9a-f]{32}$/);
    assert.strictEqual(provider.state(), first);
  });

  it('differs between instances', () => {
    const a = makeProvider().provider;
    const b = makeProvider().provider;
    assert.notStrictEqual(a.state(), b.state());
  });
});

describe('SparkOAuthProvider — clientInformation / saveClientInformation', () => {
  const original = process.env.SPARK_CLIENT_ID;
  afterEach(() => {
    if (original === undefined) delete process.env.SPARK_CLIENT_ID;
    else process.env.SPARK_CLIENT_ID = original;
  });

  it('returns undefined when no client is stored', () => {
    delete process.env.SPARK_CLIENT_ID;
    const { provider, deps } = makeProvider();
    assert.strictEqual(provider.clientInformation(), undefined);
    assert.strictEqual(deps.loadClient.mock.calls[0].arguments[0], API_BASE);
  });

  it('returns the stored client info', () => {
    delete process.env.SPARK_CLIENT_ID;
    const stored = { client_id: 'stored-client', extra: 'x' };
    const { provider } = makeProvider({ store: { client: stored } });
    assert.deepStrictEqual(provider.clientInformation(), stored);
  });

  it('honors the SPARK_CLIENT_ID env override before storage', () => {
    process.env.SPARK_CLIENT_ID = 'env-client';
    const { provider, deps } = makeProvider({ store: { client: { client_id: 'stored' } } });
    assert.deepStrictEqual(provider.clientInformation(), { client_id: 'env-client' });
    // Override short-circuits — storage is never consulted.
    assert.strictEqual(deps.loadClient.mock.calls.length, 0);
  });

  it('round-trips client info through saveClientInformation -> clientInformation', () => {
    delete process.env.SPARK_CLIENT_ID;
    const { provider, deps } = makeProvider();
    const info = { client_id: 'new-client', client_secret: 'shh' };
    provider.saveClientInformation(info);
    assert.deepStrictEqual(deps.saveClient.mock.calls[0].arguments, [info, API_BASE]);
    assert.deepStrictEqual(provider.clientInformation(), info);
  });
});

describe('SparkOAuthProvider — tokens (load adapter)', () => {
  it('returns undefined when no credentials are stored', () => {
    const { provider } = makeProvider();
    assert.strictEqual(provider.tokens(), undefined);
  });

  it('returns undefined when stored credentials have no accessToken', () => {
    const { provider } = makeProvider({ store: { credentials: { apiKey: 'k' } } });
    assert.strictEqual(provider.tokens(), undefined);
  });

  it('maps camelCase storage to snake_case SDK shape', () => {
    const expiresAt = Date.now() + 3600 * 1000;
    const { provider, deps } = makeProvider({
      store: {
        credentials: {
          accessToken: 'acc',
          refreshToken: 'ref',
          tokenType: 'Bearer',
          expiresAt,
        },
      },
    });
    const t = provider.tokens();
    assert.strictEqual(deps.loadCredentials.mock.calls[0].arguments[0], API_BASE);
    assert.strictEqual(t.access_token, 'acc');
    assert.strictEqual(t.refresh_token, 'ref');
    assert.strictEqual(t.token_type, 'Bearer');
    // expires_in is recomputed from absolute expiresAt (~3600s, allow drift).
    assert.ok(t.expires_in >= 3595 && t.expires_in <= 3600, `expires_in was ${t.expires_in}`);
  });

  it('defaults token_type to Bearer and leaves expires_in undefined without expiresAt', () => {
    const { provider } = makeProvider({
      store: { credentials: { accessToken: 'acc' } },
    });
    const t = provider.tokens();
    assert.strictEqual(t.token_type, 'Bearer');
    assert.strictEqual(t.expires_in, undefined);
  });

  it('clamps expires_in to >= 0 for an already-expired stored token', () => {
    // expiresAt far in the past → raw computation is strongly negative.
    const { provider } = makeProvider({
      store: { credentials: { accessToken: 'acc', expiresAt: Date.now() - 10_000 * 1000 } },
    });
    const t = provider.tokens();
    assert.strictEqual(t.expires_in, 0, `expires_in should clamp to 0, was ${t.expires_in}`);
    assert.ok(t.expires_in >= 0);
  });
});

describe('SparkOAuthProvider — saveTokens (save adapter)', () => {
  it('maps snake_case SDK tokens to camelCase storage with absolute expiresAt', () => {
    const before = Date.now();
    const { provider, store } = makeProvider({ local: true });
    provider.saveTokens({
      access_token: 'acc',
      refresh_token: 'ref',
      token_type: 'Bearer',
      expires_in: 3600,
    });
    const { creds, opts } = store.savedTokens[0];
    assert.strictEqual(creds.accessToken, 'acc');
    assert.strictEqual(creds.refreshToken, 'ref');
    assert.strictEqual(creds.tokenType, 'Bearer');
    assert.ok(
      creds.expiresAt >= before + 3600 * 1000 && creds.expiresAt <= Date.now() + 3600 * 1000,
      `expiresAt out of range: ${creds.expiresAt}`,
    );
    // Passes { local, apiBase } through so saveCredentials targets the right file.
    assert.deepStrictEqual(opts, { local: true, apiBase: API_BASE });
  });

  it('stores null expiresAt when expires_in is absent and defaults token_type', () => {
    const { provider, store } = makeProvider();
    provider.saveTokens({ access_token: 'acc', refresh_token: 'ref' });
    const { creds, opts } = store.savedTokens[0];
    assert.strictEqual(creds.expiresAt, null);
    assert.strictEqual(creds.tokenType, 'Bearer');
    assert.strictEqual(opts.local, undefined);
    assert.strictEqual(opts.apiBase, API_BASE);
  });

  it('round-trips through saveTokens -> tokens preserving the core fields', () => {
    const { provider } = makeProvider();
    provider.saveTokens({
      access_token: 'acc',
      refresh_token: 'ref',
      token_type: 'Bearer',
      expires_in: 7200,
    });
    const t = provider.tokens();
    assert.strictEqual(t.access_token, 'acc');
    assert.strictEqual(t.refresh_token, 'ref');
    assert.strictEqual(t.token_type, 'Bearer');
    assert.ok(t.expires_in > 7000 && t.expires_in <= 7200);
  });
});

describe('SparkOAuthProvider — code verifier (in-memory)', () => {
  it('round-trips saveCodeVerifier -> codeVerifier', () => {
    const { provider } = makeProvider();
    provider.saveCodeVerifier('verifier-123');
    assert.strictEqual(provider.codeVerifier(), 'verifier-123');
  });

  it('throws when codeVerifier() is read before being set', () => {
    const { provider } = makeProvider();
    assert.throws(() => provider.codeVerifier(), /No PKCE code verifier/);
  });
});

describe('SparkOAuthProvider — redirectToAuthorization', () => {
  let logMock;
  beforeEach(() => {
    logMock = mock.method(console, 'log', () => {});
  });
  afterEach(() => {
    logMock.mock.restore();
  });

  it('interactive: appends provider=authkit, prints the URL, and opens the browser', async () => {
    const { provider, store } = makeProvider({ interactive: true });
    const url = new URL('https://auth.example.com/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', 'abc');
    url.searchParams.set('code_challenge', 'chal');
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('state', provider.state());

    await provider.redirectToAuthorization(url);

    assert.strictEqual(store.opened.length, 1);
    const opened = new URL(store.opened[0]);
    // The authkit param is injected.
    assert.strictEqual(opened.searchParams.get('provider'), 'authkit');
    // All SDK-set params survive.
    assert.strictEqual(opened.searchParams.get('response_type'), 'code');
    assert.strictEqual(opened.searchParams.get('client_id'), 'abc');
    assert.strictEqual(opened.searchParams.get('code_challenge'), 'chal');
    assert.strictEqual(opened.searchParams.get('code_challenge_method'), 'S256');
    assert.strictEqual(opened.searchParams.get('redirect_uri'), REDIRECT_URI);
    assert.strictEqual(opened.searchParams.get('state'), provider.state());

    // The manual-login fallback URL is printed (re-added regression fix).
    const printed = logMock.mock.calls.map((c) => c.arguments[0]).join('\n');
    assert.match(printed, /If your browser didn't open, visit:/);
    assert.match(printed, /provider=authkit/);
  });

  it('interactive: mutates the passed URL object in place', async () => {
    const { provider } = makeProvider({ interactive: true });
    const url = new URL('https://auth.example.com/authorize');
    await provider.redirectToAuthorization(url);
    assert.strictEqual(url.searchParams.get('provider'), 'authkit');
  });

  it('non-interactive (default): THROWS session-expired and never opens the browser', () => {
    const { provider, deps, store } = makeProvider();
    const url = new URL('https://auth.example.com/authorize');
    assert.throws(() => provider.redirectToAuthorization(url), /Session expired.*spark login/);
    assert.strictEqual(deps.open.mock.calls.length, 0);
    assert.strictEqual(store.opened.length, 0);
    // The authkit param is still set, but no browser/print side effect leaks.
    assert.strictEqual(logMock.mock.calls.length, 0);
  });

  it('non-interactive: explicit interactive:false also throws without opening', () => {
    const { provider, deps } = makeProvider({ interactive: false });
    const url = new URL('https://auth.example.com/authorize');
    assert.throws(() => provider.redirectToAuthorization(url), /Session expired/);
    assert.strictEqual(deps.open.mock.calls.length, 0);
  });
});

describe('SparkOAuthProvider — invalidateCredentials', () => {
  let restore;
  beforeEach(() => {
    restore = process.env.SPARK_CLIENT_ID;
    delete process.env.SPARK_CLIENT_ID;
  });
  afterEach(() => {
    if (restore === undefined) delete process.env.SPARK_CLIENT_ID;
    else process.env.SPARK_CLIENT_ID = restore;
  });

  it('removes credentials for scope "tokens"', () => {
    const { provider, deps, store } = makeProvider();
    provider.invalidateCredentials('tokens');
    assert.strictEqual(deps.removeCredentials.mock.calls.length, 1);
    assert.deepStrictEqual(store.removed, [API_BASE]);
  });

  it('removes credentials for scope "all"', () => {
    const { provider, store } = makeProvider();
    provider.invalidateCredentials('all');
    assert.deepStrictEqual(store.removed, [API_BASE]);
  });

  it('does not remove credentials for scope "client"', () => {
    const { provider, deps } = makeProvider();
    provider.invalidateCredentials('client');
    assert.strictEqual(deps.removeCredentials.mock.calls.length, 0);
  });

  it('does not remove credentials for scope "verifier" or "discovery"', () => {
    const { provider, deps } = makeProvider();
    provider.invalidateCredentials('verifier');
    provider.invalidateCredentials('discovery');
    assert.strictEqual(deps.removeCredentials.mock.calls.length, 0);
  });
});
