import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// All @modelcontextprotocol/sdk usage is isolated to THIS file (single-file v2 swap).
// Verified against the installed @modelcontextprotocol/sdk@1.29.0:
//   - Client                        -> client/index.js          (ctor: new Client(clientInfo, options))
//   - StreamableHTTPClientTransport -> client/streamableHttp.js (ctor: new Transport(url, opts))
//                                      opts.authProvider (OAuth) drives the SDK's
//                                      built-in 401 -> auth() -> replay refresh; opts.requestInit
//                                      supplies extra headers (api-key Bearer + UA/version).
//   - AjvJsonSchemaValidator        -> validation/ajv            (getValidator(schema) ->
//                                      (input) => { valid, data, errorMessage })
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

import { getApiBase, normalizeApiBase } from './constants.js';
import { getAuthToken, getAuthMode } from './api.js';
import { loadCredentials } from './credentials.js';
import { SparkOAuthProvider } from './oauth-provider.js';
import { getParentOptions } from './output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

/**
 * Default dependencies for the MCP client. Overridable per-call via the `deps`
 * argument so tests can inject fakes without a live server (mirrors the `deps`
 * pattern used across the CLI).
 *
 * `getAuth` resolves the Bearer token string (api.js getAuthToken); `getMode`
 * decides apikey vs oauth (api.js getAuthMode); `makeProvider` builds the SDK
 * OAuth provider attached to the transport for oauth auth (the provider owns the
 * 401 refresh-and-replay, so there is no manual retry here).
 *
 * The transport-attached provider is NON-interactive: if its refresh token is
 * dead, a background tool call must error ("session expired — run spark login")
 * rather than silently popping a browser. `{ local }` is threaded from where the
 * credentials were loaded so a refreshed token is written back to the same file.
 */
const defaultDeps = {
  Client,
  Transport: StreamableHTTPClientTransport,
  getAuth: getAuthToken,
  getMode: getAuthMode,
  makeProvider: (base) => {
    const { local } = loadCredentials(base, { withSource: true });
    return new SparkOAuthProvider(base, { local, interactive: false });
  },
  getBase: getApiBase,
};

/**
 * Normalize an apiBase (strip trailing slashes) or fall back to getApiBase().
 */
function resolveBase(apiBase, d) {
  return normalizeApiBase(apiBase) || d.getBase();
}

/**
 * Build a StreamableHTTPClientTransport pointed at `${base}/mcp`.
 *
 * Two auth modes, decided by `mode`:
 *  - oauth: attach a SparkOAuthProvider as `authProvider`. The transport then
 *    sources the Bearer from `provider.tokens()` AND auto-refreshes-and-replays
 *    on a 401 via `auth(provider, ...)` — so NO manual retry lives in this module
 *    and NO static Authorization header is set (the provider supplies it).
 *  - apikey: send the key via `requestInit.headers.Authorization` and attach NO
 *    provider, so the SDK never tries to refresh a static api key (a 401
 *    propagates unretried).
 *  - null (no auth): no provider, no Authorization header — the server 401s,
 *    which is the intended behavior.
 *
 * @param {string} base - resolved API base.
 * @param {'apikey'|'oauth'|null} mode
 * @param {string|null} token - Bearer token (used only for apikey mode).
 * @param {object} d - resolved deps.
 */
function buildTransport(base, mode, token, d) {
  const url = new URL(`${base}/mcp`);
  const requestInit = {
    headers: {
      'User-Agent': `spark-cli/${pkg.version}`,
      'X-CLI-VERSION': pkg.version,
    },
  };

  if (mode === 'oauth') {
    // OAuth: the provider supplies the Bearer and owns refresh-and-replay on 401.
    return new d.Transport(url, { authProvider: d.makeProvider(base), requestInit });
  }

  if (mode === 'apikey') {
    // API key: static Bearer, no provider -> never refreshed on 401.
    requestInit.headers.Authorization = `Bearer ${token}`;
  }
  // mode === null: no auth attached (server will 401).
  return new d.Transport(url, { requestInit });
}

/**
 * Create a fresh SDK Client. Isolated so the clientInfo/options shape lives in
 * one place.
 */
function makeClient(d) {
  return new d.Client({ name: 'spark-cli', version: pkg.version });
}

/**
 * Connect to the MCP server at `${getApiBase()}/mcp`.
 *
 * Resolves the auth mode (api.js getAuthMode): oauth attaches a SparkOAuthProvider
 * to the transport (the SDK then drives Bearer + 401 refresh); apikey sends a
 * static Bearer header with no provider. Returns { client }.
 *
 * Internal — the single connect path shared by listTools/callMcpTool (not exported).
 *
 * @param {string} [apiBase]
 * @param {object} [deps] - DI overrides: { Client, Transport, getAuth, getMode,
 *   makeProvider, getBase } plus an optional `apiKey` to forward to the resolvers.
 */
async function connectMcp(apiBase, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const base = resolveBase(apiBase, d);
  const apiKey = deps.apiKey;

  const mode = d.getMode(base, { apiKey });
  if (!mode) {
    throw new Error("Not authenticated. Please run 'spark login' first.");
  }

  // For api-key mode we need the actual token string for the static header. For
  // oauth the provider supplies the token, so we skip the resolve.
  const token = mode === 'apikey' ? await d.getAuth(base, { apiKey }) : null;

  const client = makeClient(d);
  const transport = buildTransport(base, mode, token, d);
  try {
    await client.connect(transport);
  } catch (err) {
    // A failed connect must not leak a half-open transport (the login flow goes to
    // some lengths to avoid lingering sockets). Best-effort close, swallow any
    // secondary error, then propagate the original failure unchanged.
    await closeQuietly(client);
    throw err;
  }

  return { client };
}

/**
 * Connect, call tools/list, return the normalized tools array, and close.
 * Used by tool-manifest.js's fetch.
 *
 * @param {string} [apiBase]
 * @param {object} [deps]
 * @returns {Promise<Array<{name, description?, inputSchema?, outputSchema?}>>}
 */
export async function listTools(apiBase, deps = {}) {
  const { client } = await connectMcp(apiBase, deps);
  try {
    const result = await client.listTools();
    return result?.tools ?? [];
  } finally {
    await closeQuietly(client);
  }
}

/**
 * Call an MCP tool (tools/call).
 *
 * Connects via connectMcp (the shared connect/auth/transport path) and performs
 * the call. For oauth the transport's authProvider owns the 401 refresh-and-replay,
 * so there is NO manual retry here; for api-key a 401 simply propagates (never
 * retried). The parent command's --api-key is folded into the connect deps.
 *
 * @param {string} [apiBase]
 * @param {string} name - the authoritative tools/call name
 * @param {object} args - the `arguments` object for the tool
 * @param {object|null} [command] - commander command (read for --api-key)
 * @param {object} [deps]
 * @returns {Promise<object>} the raw tools/call result
 */
export async function callMcpTool(apiBase, name, args, command = null, deps = {}) {
  // Fold the parent command's --api-key into the connect deps, preserving the
  // explicit-deps-first precedence (deps.apiKey ?? parentOpts.apiKey), then reuse
  // connectMcp as the single connect/auth/transport path (no duplicated body here).
  const parentOpts = command ? getParentOptions(command) : {};
  const apiKey = deps.apiKey ?? parentOpts.apiKey;

  const { client } = await connectMcp(apiBase, { ...deps, apiKey });
  try {
    return await client.callTool({ name, arguments: args ?? {} });
  } finally {
    await closeQuietly(client);
  }
}

/**
 * Validate tool arguments against a JSON Schema using the SDK's bundled ajv
 * validator. Purely to produce friendly client-side error messages — the server
 * remains authoritative. Returns { valid, errors } where `errors` is a string[]
 * (empty when valid). Keeps the SDK/ajv import an implementation detail of this
 * module.
 *
 * @param {object} inputSchema - JSON Schema object from tools/list
 * @param {object} args - the arguments object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateArgs(inputSchema, args) {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return { valid: true, errors: [] };
  }
  let validate;
  try {
    validate = new AjvJsonSchemaValidator().getValidator(inputSchema);
  } catch {
    // A schema the validator cannot compile should not block the call; the
    // server stays authoritative. Fail open.
    return { valid: true, errors: [] };
  }
  const result = validate(args ?? {});
  if (result.valid) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: result.errorMessage ? [result.errorMessage] : ['Invalid arguments'],
  };
}

/**
 * Close a client without throwing (best-effort cleanup).
 */
async function closeQuietly(client) {
  try {
    await client?.close?.();
  } catch {
    // ignore cleanup errors
  }
}
