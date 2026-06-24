import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { auth } from '@modelcontextprotocol/sdk/client/auth.js';

import { getApiBase, normalizeApiBase } from './constants.js';
import { loadCredentials } from './credentials.js';
import { SparkOAuthProvider, SESSION_EXPIRED_MESSAGE } from './oauth-provider.js';
import { getParentOptions } from './output.js';
import { toolResponseSchema } from './schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

/**
 * Single internal resolver for both `getAuthToken` and `getAuthMode`.
 *
 * Walks the auth precedence ladder once and returns `{ token, mode }`:
 *   - CLI flag (`options.apiKey`)        -> { token: flag,  mode: 'apikey' }
 *   - `SPARK_API_KEY` env var            -> { token: env,   mode: 'apikey' }
 *   - stored api key (`apiKey`/`token`)  -> { token: key,   mode: 'apikey' }
 *   - stored OAuth `accessToken`         -> { token: access,mode: 'oauth'  }
 *   - nothing available                  -> { token: null,  mode: null     }
 *
 * `getAuthToken` projects `.token`; `getAuthMode` projects `.mode`. The flag/env
 * branches short-circuit before `loadCreds` is consulted, matching the original
 * behavior of both functions. Performs NO refresh and never throws on missing
 * credentials.
 *
 * @param {string} apiBase
 * @param {object} options
 * @param {string} [options.apiKey] - CLI `--api-key` flag value.
 * @param {object} deps - DI override: { loadCreds }.
 * @returns {{ token: string|null, mode: 'apikey'|'oauth'|null }}
 */
function resolveAuth(apiBase, options, deps) {
  const { loadCreds = loadCredentials } = deps;

  if (options.apiKey) {
    return { token: options.apiKey, mode: 'apikey' };
  }

  if (process.env.SPARK_API_KEY) {
    return { token: process.env.SPARK_API_KEY, mode: 'apikey' };
  }

  const credentials = loadCreds(apiBase);
  if (credentials) {
    if (credentials.apiKey || credentials.token) {
      return { token: credentials.apiKey || credentials.token, mode: 'apikey' };
    }
    if (credentials.accessToken) {
      return { token: credentials.accessToken, mode: 'oauth' };
    }
  }

  return { token: null, mode: null };
}

/**
 * Resolve the auth token to use for a request.
 *
 * Priority: CLI flag (`options.apiKey`) > `SPARK_API_KEY` env var > stored api key
 * (legacy `apiKey`/`token` in credentials) > stored OAuth access token.
 *
 * This is now a pure resolver: it performs NO proactive refresh. Refresh is
 * reactive (driven by the SDK transport for MCP and by `getCurrentUser`'s one-shot
 * `auth()` on 401 for REST). Returns the token string, or `null` when no auth is
 * available. Never throws on missing credentials.
 *
 * @param {string} apiBase
 * @param {object} [options]
 * @param {string} [options.apiKey] - CLI `--api-key` flag value.
 * @param {object} [deps] - DI override: { loadCreds }.
 * @returns {Promise<string|null>}
 */
export async function getAuthToken(apiBase, options = {}, deps = {}) {
  return resolveAuth(apiBase, options, deps).token;
}

/**
 * Determine the auth mode for a request without resolving/refreshing tokens.
 *
 * Returns `'apikey'` when an api key is present (CLI flag, `SPARK_API_KEY`, or a
 * stored legacy api key), `'oauth'` when OAuth credentials exist for `apiBase`,
 * otherwise `null`.
 *
 * Consumers (e.g. mcp-client.js) use this to decide whether to attach the OAuth
 * provider to the transport (oauth) or send a static Bearer header (apikey).
 *
 * @param {string} apiBase
 * @param {object} [options]
 * @param {string} [options.apiKey] - CLI `--api-key` flag value.
 * @param {object} [deps] - DI override: { loadCreds }.
 * @returns {'apikey'|'oauth'|null}
 */
export function getAuthMode(apiBase, options = {}, deps = {}) {
  return resolveAuth(apiBase, options, deps).mode;
}

/**
 * Get current user info.
 *
 * Thin REST call: `GET ${apiBase}/api/internal/v1/user` with a Bearer token from
 * `getAuthToken`. On a 401 in OAuth mode, refreshes ONCE via the SDK `auth()`
 * orchestrator (using the stored refresh token) and retries the GET once. In
 * api-key mode a 401 is never retried. Throws on a non-2xx response after the
 * single retry, preserving the error/exit behavior callers rely on.
 *
 * @param {string} apiBase
 * @param {object} [options] - resolution options. Accepts `{ apiKey }`, or a
 *   commander `command` object (back-compat: `apiKey` is then read from the
 *   parent command options).
 * @param {object} [deps] - DI overrides: { getAuth, getMode, doFetch, runAuth,
 *   makeProvider, schema }.
 */
export async function getCurrentUser(apiBase, options = {}, deps = {}) {
  const {
    getAuth = getAuthToken,
    getMode = getAuthMode,
    doFetch = fetch,
    runAuth = auth,
    // Non-interactive provider (no browser pop on refresh failure). `{ local }`
    // is threaded by the caller below from where the credentials were loaded.
    makeProvider = (base, opts) => new SparkOAuthProvider(base, { ...opts, interactive: false }),
    loadCreds = loadCredentials,
    schema = toolResponseSchema,
  } = deps;

  const base = normalizeApiBase(apiBase) || getApiBase();

  // Back-compat: a commander `command` may be passed as `options` (the old
  // signature). Detect it and resolve `--api-key` from the parent options.
  const resolved = isCommand(options)
    ? { apiKey: getParentOptions(options).apiKey }
    : options || {};

  const token = await getAuth(base, { apiKey: resolved.apiKey });
  if (!token) {
    throw new Error("Not authenticated. Please run 'spark login' first.");
  }

  const mode = getMode(base, { apiKey: resolved.apiKey });

  const url = `${base}/api/internal/v1/user`;
  const baseHeaders = () => ({
    'Content-Type': 'application/json',
    'User-Agent': `spark-cli/${pkg.version}`,
    'X-CLI-VERSION': pkg.version,
  });
  const doGet = (bearer) =>
    doFetch(url, {
      method: 'GET',
      headers: { ...baseHeaders(), Authorization: `Bearer ${bearer}` },
    });

  let response = await doGet(token);

  // OAuth-only reactive refresh: on 401, run auth() once (refreshes via the
  // provider's stored refresh token), re-read the token, retry once. API-key auth
  // is never retried.
  //
  // The refresh provider must write the new token back to the SAME settings file
  // the credentials were loaded from (local vs global), so thread `{ local }` from
  // the credential source rather than letting saveCredentials auto-detect.
  if (response.status === 401 && mode === 'oauth') {
    const { local } = loadCreds(base, { withSource: true });
    const provider = makeProvider(base, { local });
    try {
      // The non-interactive provider THROWS rather than opening a browser if the
      // refresh token is also dead, so a stale-token retry can never happen.
      const result = await runAuth(provider, { serverUrl: `${base}/mcp` });
      if (result !== 'AUTHORIZED') {
        throw new Error('refresh did not authorize');
      }
      const fresh = provider.tokens();
      if (!fresh?.access_token) {
        throw new Error('no token');
      }
      response = await doGet(fresh.access_token);
    } catch {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  const json = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path && issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    throw new Error(
      `API response validation failed for GET ${url} (${response.status}): ${issues}`,
    );
  }
  return result.data;
}

/**
 * Heuristic: is `value` a commander Command instance (back-compat for the old
 * `getCurrentUser(apiBase, command)` signature) rather than a plain options bag?
 *
 * Gate on `opts` being a function: a plain options bag can legitimately carry
 * `parent: null` (e.g. `{ apiKey, parent: null }`), which the older
 * `parent !== undefined` check misrouted as a command and dropped `--api-key`.
 */
function isCommand(value) {
  return !!value && typeof value.opts === 'function';
}
