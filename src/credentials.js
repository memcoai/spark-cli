import { existsSync } from 'node:fs';
import {
  DEFAULT_API_BASE,
  getApiBase,
  normalizeApiBase,
  SETTINGS_PATH,
  LOCAL_SETTINGS_PATH,
} from './constants.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';

const defaultDeps = {
  readKey: readSettingsKey,
  writeKey: writeSettingsKey,
  getBase: getApiBase,
  exists: existsSync,
};

/**
 * Resolve the active settings.json path using the local-first write policy:
 * local (`./.spark/settings.json`) when an explicit `local` flag says so OR when a
 * local settings FILE exists, otherwise global (`~/.spark/settings.json`).
 *
 * Single home for the local-vs-global write-location decision shared by
 * `saveCredentials` (here) and `tool-manifest.js`'s `getActiveSettingsPath`, so the
 * manifest lands next to the credentials it depends on. The injectable `exists`
 * dependency preserves the settings-FILE-existence DI seam both call sites rely on.
 *
 * @param {object} [options]
 * @param {boolean} [options.local] - explicit override; when undefined, auto-detect.
 * @param {(path: string) => boolean} [options.exists] - settings-file existence check.
 * @returns {string} LOCAL_SETTINGS_PATH or SETTINGS_PATH
 */
export function resolveActiveSettingsPath({ local, exists = existsSync } = {}) {
  const isLocal = local ?? exists(LOCAL_SETTINGS_PATH);
  return isLocal ? LOCAL_SETTINGS_PATH : SETTINGS_PATH;
}

/**
 * True when `creds` is in the legacy flat (pre-per-URL) shape: auth fields live at
 * the top level instead of under an apiBase key. Used to decide when to migrate.
 */
function isFlatCredentials(creds) {
  return !!(creds && (creds.accessToken || creds.apiKey || creds.refreshToken || creds.token));
}

/**
 * Read all credentials from a settings path, migrating flat -> per-URL if needed.
 * If the stored value is a flat object (auth fields at top level), wraps it under
 * the DEFAULT_API_BASE key, writes it back, and returns the per-URL object.
 * Returns the (possibly migrated) credentials object.
 */
function migrateCredentials(settingsPath, deps) {
  const creds = deps.readKey(settingsPath, 'credentials');
  if (isFlatCredentials(creds)) {
    const migrated = { [DEFAULT_API_BASE]: creds };
    deps.writeKey(settingsPath, 'credentials', migrated);
    return migrated;
  }
  return creds;
}

/**
 * Load credentials from local (.spark/) only — no global fallback.
 */
export function loadLocalCredentials(apiBase, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  const url = normalizeApiBase(apiBase) || d.getBase();
  const all = migrateCredentials(LOCAL_SETTINGS_PATH, d);
  return all?.[url] || null;
}

/**
 * Load credentials from file.
 * Checks local (.spark/) first, then global (~/.spark/).
 * When withSource is true, returns { credentials, local } so callers
 * can write back to the same location (e.g. during token refresh).
 */
export function loadCredentials(apiBase, { withSource = false, ...deps } = {}) {
  const d = { ...defaultDeps, ...deps };
  const url = normalizeApiBase(apiBase) || d.getBase();
  for (const [path, isLocal] of [
    [LOCAL_SETTINGS_PATH, true],
    [SETTINGS_PATH, false],
  ]) {
    const all = migrateCredentials(path, d);
    if (all?.[url]) {
      return withSource ? { credentials: all[url], local: isLocal } : all[url];
    }
  }
  return withSource ? { credentials: null, local: false } : null;
}

/**
 * Save credentials to settings.json, keyed by API base URL.
 * @param {object} credentials
 * @param {object} [options]
 * @param {boolean} [options.local] - true for ./.spark/, false for ~/.spark/.
 *   If omitted, auto-detects: saves to local if local settings exist, otherwise global.
 * @param {string} [options.apiBase] - API base URL to key credentials under.
 */
export function saveCredentials(credentials, { local, apiBase, ...deps } = {}) {
  const d = { ...defaultDeps, ...deps };
  const path = resolveActiveSettingsPath({ local, exists: d.exists });
  const url = normalizeApiBase(apiBase) || d.getBase();
  const all = d.readKey(path, 'credentials') || {};
  // If all is in old flat format, start fresh per-URL object
  const perUrl = isFlatCredentials(all) ? { [DEFAULT_API_BASE]: all } : all;
  perUrl[url] = credentials;
  d.writeKey(path, 'credentials', perUrl);
}

/**
 * Check if credentials exist in either local or global location.
 */
export function credentialsExist(apiBase, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  const url = normalizeApiBase(apiBase) || d.getBase();
  for (const path of [LOCAL_SETTINGS_PATH, SETTINGS_PATH]) {
    const all = migrateCredentials(path, d);
    if (all?.[url]) return true;
  }
  return false;
}

/**
 * Remove credentials. Removes the credentials for the active API base from settings.json.
 * Checks local first, then global.
 * Returns a description of what was removed, or null if nothing found.
 */
export function removeCredentials(apiBase, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  const url = normalizeApiBase(apiBase) || d.getBase();
  for (const [path, label] of [
    [LOCAL_SETTINGS_PATH, 'local'],
    [SETTINGS_PATH, 'global'],
  ]) {
    const all = migrateCredentials(path, d);
    if (all?.[url]) {
      delete all[url];
      d.writeKey(path, 'credentials', Object.keys(all).length > 0 ? all : null);
      return label;
    }
  }
  return null;
}

/**
 * Check if token is expired (with 5 min buffer)
 */
export function isTokenExpired(credentials) {
  if (!credentials?.expiresAt) {
    return false;
  }
  return Date.now() >= credentials.expiresAt - 5 * 60 * 1000;
}
