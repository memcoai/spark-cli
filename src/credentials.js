import { existsSync } from 'node:fs';
import { DEFAULT_API_BASE, getApiBase, SETTINGS_PATH, LOCAL_SETTINGS_PATH } from './constants.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';

const defaultDeps = {
  readKey: readSettingsKey,
  writeKey: writeSettingsKey,
  getBase: getApiBase,
  exists: existsSync,
};

function normalizeUrl(url) {
  return typeof url === 'string' ? url.replace(/\/+$/, '') : null;
}

/**
 * Migrate flat credentials to per-URL format if needed.
 * If `credentials` is a flat object (has accessToken/apiKey/refreshToken at top level),
 * wraps it under the DEFAULT_API_BASE key and writes back.
 * Returns the (possibly migrated) credentials object.
 */
function migrateCredentials(settingsPath, deps) {
  const creds = deps.readKey(settingsPath, 'credentials');
  if (creds && (creds.accessToken || creds.apiKey || creds.refreshToken || creds.token)) {
    const migrated = { [DEFAULT_API_BASE]: creds };
    deps.writeKey(settingsPath, 'credentials', migrated);
    return migrated;
  }
  return creds;
}

/**
 * Read all credentials from a settings path, migrating if needed.
 */
function readAllCredentials(settingsPath, deps) {
  return migrateCredentials(settingsPath, deps);
}

/**
 * Load credentials from local (.spark/) only — no global fallback.
 */
export function loadLocalCredentials(apiBase, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  const url = normalizeUrl(apiBase) || d.getBase();
  const all = readAllCredentials(LOCAL_SETTINGS_PATH, d);
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
  const url = normalizeUrl(apiBase) || d.getBase();
  for (const [path, isLocal] of [
    [LOCAL_SETTINGS_PATH, true],
    [SETTINGS_PATH, false],
  ]) {
    const all = readAllCredentials(path, d);
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
  const isLocal = local ?? d.exists(LOCAL_SETTINGS_PATH);
  const path = isLocal ? LOCAL_SETTINGS_PATH : SETTINGS_PATH;
  const url = normalizeUrl(apiBase) || d.getBase();
  const all = d.readKey(path, 'credentials') || {};
  // If all is in old flat format, start fresh per-URL object
  const perUrl =
    all.accessToken || all.apiKey || all.refreshToken || all.token
      ? { [DEFAULT_API_BASE]: all }
      : all;
  perUrl[url] = credentials;
  d.writeKey(path, 'credentials', perUrl);
}

/**
 * Check if credentials exist in either local or global location.
 */
export function credentialsExist(apiBase, deps = defaultDeps) {
  const d = { ...defaultDeps, ...deps };
  const url = normalizeUrl(apiBase) || d.getBase();
  for (const path of [LOCAL_SETTINGS_PATH, SETTINGS_PATH]) {
    const all = readAllCredentials(path, d);
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
  const url = normalizeUrl(apiBase) || d.getBase();
  for (const [path, label] of [
    [LOCAL_SETTINGS_PATH, 'local'],
    [SETTINGS_PATH, 'global'],
  ]) {
    const all = readAllCredentials(path, d);
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
