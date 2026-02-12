import { existsSync } from 'node:fs';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH } from './constants.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';

/**
 * Load credentials from local (.spark/) only — no global fallback.
 */
export function loadLocalCredentials() {
  return readSettingsKey(LOCAL_SETTINGS_PATH, 'credentials');
}

/**
 * Load credentials from file.
 * Checks local (.spark/) first, then global (~/.spark/).
 */
export function loadCredentials() {
  for (const path of [LOCAL_SETTINGS_PATH, SETTINGS_PATH]) {
    const creds = readSettingsKey(path, 'credentials');
    if (creds) return creds;
  }
  return null;
}

/**
 * Save credentials to settings.json.
 * @param {object} credentials
 * @param {object} [options]
 * @param {boolean} [options.local] - true for ./.spark/, false for ~/.spark/.
 *   If omitted, auto-detects: saves to local if local settings exist, otherwise global.
 */
export function saveCredentials(credentials, { local } = {}) {
  const isLocal = local ?? existsSync(LOCAL_SETTINGS_PATH);
  const path = isLocal ? LOCAL_SETTINGS_PATH : SETTINGS_PATH;
  writeSettingsKey(path, 'credentials', credentials);
}

/**
 * Check if credentials exist in either local or global location.
 */
export function credentialsExist() {
  return !!(
    readSettingsKey(LOCAL_SETTINGS_PATH, 'credentials') ||
    readSettingsKey(SETTINGS_PATH, 'credentials')
  );
}

/**
 * Remove credentials. Removes the credentials key from settings.json.
 * Checks local first, then global.
 * Returns a description of what was removed, or null if nothing found.
 */
export function removeCredentials() {
  if (readSettingsKey(LOCAL_SETTINGS_PATH, 'credentials')) {
    writeSettingsKey(LOCAL_SETTINGS_PATH, 'credentials', null);
    return 'local';
  }
  if (readSettingsKey(SETTINGS_PATH, 'credentials')) {
    writeSettingsKey(SETTINGS_PATH, 'credentials', null);
    return 'global';
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
