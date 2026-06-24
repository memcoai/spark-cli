import { randomBytes } from 'node:crypto';
import open from 'open';
import { CALLBACK_PORT, getApiBase, normalizeApiBase } from './constants.js';
import { loadCredentials, saveCredentials, removeCredentials } from './credentials.js';
import { loadClient, saveClient } from './oauth.js';

const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

/**
 * Single source of truth for the message surfaced when a non-interactive code path
 * (transport/REST refresh) needs a browser login but must not pop one. Imported by
 * api.js for its REST 401 path so the two stay identical without manual syncing.
 */
export const SESSION_EXPIRED_MESSAGE = "Session expired. Please run 'spark login' again.";

/**
 * SDK `OAuthClientProvider` implementation backed by Spark's per-URL settings
 * storage. One instance per `apiBase` (the SDK treats provider state — tokens,
 * client info, code verifier — as session-scoped and per-server).
 *
 * Discovery, dynamic client registration, PKCE generation, authorize-URL
 * construction, and code/refresh token exchange are all performed by the SDK's
 * `auth()` orchestrator; this class only adapts the SDK's storage/redirect hooks
 * onto our `credentials.js` + `oauth.js` storage.
 *
 * Every non-pure dependency (client storage, credential accessors, browser open)
 * is injectable via the `deps` constructor option so the provider can be
 * unit-tested with no filesystem, network, or browser.
 *
 * @see node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.d.ts
 */
export class SparkOAuthProvider {
  /**
   * @param {string} apiBase - resolved API base (e.g. https://spark.memco.ai).
   * @param {object} [opts]
   * @param {boolean} [opts.local] - write tokens to ./.spark (true) vs ~/.spark
   *   (false). When undefined, `saveCredentials` auto-detects (its existing
   *   behavior).
   * @param {boolean} [opts.interactive] - when true (login flow only), an
   *   `auth()` redirect opens a browser; when false (default — transport/REST
   *   refresh paths) a redirect THROWS a session-expired error instead of
   *   silently popping a browser.
   * @param {object} [opts.deps] - injectable, non-pure dependencies.
   * @param {Function} [opts.deps.loadClient]
   * @param {Function} [opts.deps.saveClient]
   * @param {Function} [opts.deps.loadCredentials]
   * @param {Function} [opts.deps.saveCredentials]
   * @param {Function} [opts.deps.removeCredentials]
   * @param {Function} [opts.deps.open] - browser-open function.
   */
  constructor(apiBase, { local, interactive = false, deps = {} } = {}) {
    this.apiBase = normalizeApiBase(apiBase) || getApiBase();
    this.local = local;
    this.interactive = interactive;
    this._codeVerifier = undefined; // in-memory; lives only across the redirect.
    // A per-instance OAuth2 `state` value preserves today's loopback CSRF check.
    this._state = randomBytes(16).toString('hex');
    this._deps = {
      loadClient,
      saveClient,
      loadCredentials,
      saveCredentials,
      removeCredentials,
      open,
      ...deps,
    };
  }

  // ── redirect target ─────────────────────────────────────────────────────────
  get redirectUrl() {
    return REDIRECT_URI;
  }

  // ── RFC 7591 client metadata (the DCR request body) ───────────────────────────
  get clientMetadata() {
    return {
      client_name: 'spark-cli',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  // ── OAuth2 state (CSRF) — stable per instance ────────────────────────────────
  state() {
    return this._state;
  }

  // ── client registration storage → oauth.js loadClient/saveClient ─────────────
  clientInformation() {
    if (process.env.SPARK_CLIENT_ID) {
      return { client_id: process.env.SPARK_CLIENT_ID };
    }
    return this._deps.loadClient(this.apiBase) ?? undefined;
  }

  saveClientInformation(info) {
    this._deps.saveClient(info, this.apiBase);
  }

  // ── token storage → credentials.js, with a field-shape adapter ───────────────
  // Stored shape (camelCase + absolute expiresAt) ↔ SDK shape (snake_case + relative expires_in).
  tokens() {
    const c = this._deps.loadCredentials(this.apiBase);
    if (!c?.accessToken) return undefined;
    return {
      access_token: c.accessToken,
      refresh_token: c.refreshToken,
      token_type: c.tokenType ?? 'Bearer',
      // Clamp to >= 0: an already-expired stored token must not report a
      // negative expires_in (the SDK treats <= 0 as expired, never negative).
      expires_in: c.expiresAt
        ? Math.max(0, Math.floor((c.expiresAt - Date.now()) / 1000))
        : undefined,
    };
  }

  saveTokens(t) {
    this._deps.saveCredentials(
      {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : null,
        tokenType: t.token_type ?? 'Bearer',
      },
      { local: this.local, apiBase: this.apiBase },
    );
  }

  // ── PKCE verifier (in-memory; round-trips through our own loopback server) ────
  saveCodeVerifier(verifier) {
    this._codeVerifier = verifier;
  }

  codeVerifier() {
    if (!this._codeVerifier) {
      throw new Error('No PKCE code verifier in this session');
    }
    return this._codeVerifier;
  }

  // ── browser redirect — the authkit param hook lives HERE ──────────────────────
  // The SDK hands us the fully-built (mutable) authorize URL before the browser
  // opens, so appending `provider=authkit` here is the supported mechanism to
  // preserve Spark's AuthKit routing.
  //
  // interactive (login flow): print a manual-login fallback URL, then open the
  // browser. non-interactive (transport/REST refresh): the only reason auth()
  // reaches a redirect is that the access token is expired AND the refresh token
  // failed/absent — popping a browser from a background tool call would be a
  // surprise, so THROW the session-expired message instead.
  redirectToAuthorization(authorizationUrl) {
    authorizationUrl.searchParams.set('provider', 'authkit');
    const url = authorizationUrl.toString();
    if (!this.interactive) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    console.log(`If your browser didn't open, visit: ${url}`);
    return this._deps.open(url);
  }

  // ── credential invalidation — lets auth() wipe bad creds and retry ───────────
  invalidateCredentials(scope) {
    if (scope === 'tokens' || scope === 'all') {
      this._deps.removeCredentials(this.apiBase);
    }
    // 'client' / 'verifier' / 'discovery' scopes: no-op (client info is cheap to
    // re-register; the verifier is in-memory; discovery state is not cached).
  }
}
