import { existsSync } from 'node:fs';
import { getApiBase, SETTINGS_PATH, LOCAL_SETTINGS_PATH } from './constants.js';
import { resolveActiveSettingsPath } from './credentials.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';
import { listTools } from './mcp-client.js';
import { toolManifestCacheSchema } from './schemas.js';

/**
 * Tool manifest TTL cache. Mirrors the `update-check.js` cache shape
 * (`getCached*` / `fetch*` / `check*`) — the manifest snapshot of the MCP
 * server's `tools/list` is stored under the `toolManifest` settings key,
 * keyed/validated by `apiBase`, with a 24h TTL. It is populated eagerly at
 * login/init and read offline (zero network) for `--help` / command
 * registration. All reads fail open: a missing or corrupt cache yields `null`
 * (callers print the existing `spark login` guidance), never a throw.
 */

export const TOOL_MANIFEST_TTL_MS = 24 * 60 * 60 * 1000;

const defaultDeps = {
  readKey: readSettingsKey,
  writeKey: writeSettingsKey,
  getBase: getApiBase,
  exists: existsSync,
  list: listTools,
};

/**
 * Resolve the active settings path the manifest writes to — local-first when a
 * local `.spark/settings.json` exists, else the global path. Delegates to the
 * shared `resolveActiveSettingsPath` in `credentials.js` (the single home for the
 * local-vs-global write-location decision `saveCredentials` also uses), so the
 * manifest lands next to the credentials it depends on (a `spark login --local`
 * manifest is found locally).
 *
 * The injected `deps.exists` seam is forwarded to the shared helper, preserving the
 * settings-FILE-existence semantics `tool-manifest.test.js` pins.
 *
 * @param {object} [deps]
 * @returns {string} LOCAL_SETTINGS_PATH if it exists, otherwise SETTINGS_PATH
 */
export function getActiveSettingsPath(deps = {}) {
  return resolveActiveSettingsPath({ exists: deps.exists });
}

/**
 * Read the cached tool manifest. Checks local (`./.spark/`) first, then global
 * (`~/.spark/`), mirroring credentials resolution. Returns the cache object
 * `{ tools, checkedAt, apiBase }` or `null`. Fails open on a missing or corrupt
 * cache.
 *
 * The settings layer already validates `toolManifest` against
 * `toolManifestCacheSchema` and fails open to `null` for a corrupt value (see
 * `settingsSchema` in `schemas.js`), so in production `readKey` returns a valid
 * object or `null` — matching the `update-check.js` caches, which trust that
 * validation. The lightweight `safeParse` below is retained only as a defensive
 * guard for an injected `readKey` that bypasses the settings schema (the
 * fail-open-on-corrupt contract is unit-tested directly against this function);
 * it never rejects a manifest that already passed the settings-level check.
 *
 * @param {object} [deps]
 * @returns {{ tools: Array, checkedAt: number, apiBase: string } | null}
 */
export function getCachedToolManifest(deps = {}) {
  const d = { ...defaultDeps, ...deps };
  for (const path of [LOCAL_SETTINGS_PATH, SETTINGS_PATH]) {
    const raw = d.readKey(path, 'toolManifest');
    if (!raw) continue;
    const parsed = toolManifestCacheSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/**
 * Fetch the live tool manifest from the MCP server's `tools/list`, normalize it,
 * and write it to the active settings path. The command surface is a PURE
 * reflection of the server: each tool is stored verbatim as
 * `{ serverName, description, inputSchema, outputSchema }` where `serverName`
 * is the authoritative `tools/list`/`tools/call` name (no friendly remapping).
 *
 * Never throws to callers (fail-open, like `fetchSkillsVersion`) — returns the
 * cache object on success, or `null` on any error so login/init never abort.
 *
 * @param {string} apiBase
 * @param {{ local?: boolean }} [opts] - explicit write location (login passes the
 *   resolved `local` flag); when omitted, the active path is auto-detected.
 * @param {object} [deps]
 * @returns {Promise<{ tools: Array, checkedAt: number, apiBase: string } | null>}
 */
export async function fetchToolManifest(apiBase, { local } = {}, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  try {
    const base = apiBase || d.getBase();
    const rawTools = (await d.list(base, deps)) || [];
    const tools = rawTools.map((tool) => {
      const entry = {
        serverName: tool.name,
      };
      if (tool.description !== undefined) entry.description = tool.description;
      if (tool.inputSchema !== undefined) entry.inputSchema = tool.inputSchema;
      if (tool.outputSchema !== undefined) entry.outputSchema = tool.outputSchema;
      return entry;
    });
    const result = { tools, checkedAt: Date.now(), apiBase: base };
    const path =
      local === undefined ? getActiveSettingsPath(d) : local ? LOCAL_SETTINGS_PATH : SETTINGS_PATH;
    d.writeKey(path, 'toolManifest', result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Return the manifest if it is fresh (`< TTL` AND `cache.apiBase === apiBase`),
 * otherwise re-fetch. Never rejects (try/catch → null), exactly like
 * `checkSkillsVersion`.
 *
 * @param {string} [apiBase]
 * @param {object} [deps]
 * @returns {Promise<{ tools: Array, checkedAt: number, apiBase: string } | null>}
 */
export async function checkToolManifest(apiBase, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  try {
    const base = apiBase || d.getBase();
    const cached = getCachedToolManifest(d);
    if (
      cached?.tools &&
      cached.checkedAt &&
      cached.apiBase === base &&
      Date.now() - cached.checkedAt < TOOL_MANIFEST_TTL_MS
    ) {
      return cached;
    }
    return await fetchToolManifest(base, {}, d);
  } catch {
    return null;
  }
}

/**
 * Synchronous, offline manifest accessor for command registration / `--help`.
 * Performs ZERO network. Returns the cached tools array when the cache belongs to
 * the current `apiBase`, else `[]` — a foreign or empty cache yields no dynamic
 * commands (never a stale foreign surface, and no cold-cache live fetch).
 *
 * @param {string} [apiBase]
 * @param {object} [deps]
 * @returns {Array}
 */
export function getManifestForRegistration(apiBase = getApiBase(), deps = {}) {
  const cached = getCachedToolManifest(deps);
  if (cached?.apiBase === apiBase && Array.isArray(cached.tools)) {
    return cached.tools;
  }
  return [];
}
