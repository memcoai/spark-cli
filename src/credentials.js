import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import {
  SPARK_DIR, CREDENTIALS_PATH,
  LOCAL_SPARK_DIR, LOCAL_CREDENTIALS_PATH,
} from './constants.js';

/**
 * Load credentials from local (.spark/) only — no global fallback.
 */
export function loadLocalCredentials() {
  if (existsSync(LOCAL_CREDENTIALS_PATH)) {
    try {
      return JSON.parse(readFileSync(LOCAL_CREDENTIALS_PATH, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Load credentials from file.
 * Checks local (.spark/) first, then global (~/.spark/).
 */
export function loadCredentials() {
  for (const path of [LOCAL_CREDENTIALS_PATH, CREDENTIALS_PATH]) {
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        // Invalid file, try next location
      }
    }
  }
  return null;
}

/**
 * Save credentials to file.
 * @param {object} credentials
 * @param {object} [options]
 * @param {boolean} [options.local] - true for ./.spark/, false for ~/.spark/.
 *   If omitted, auto-detects: saves to local if local credentials exist, otherwise global.
 */
export function saveCredentials(credentials, { local } = {}) {
  const isLocal = local ?? existsSync(LOCAL_CREDENTIALS_PATH);
  const dir = isLocal ? LOCAL_SPARK_DIR : SPARK_DIR;
  const path = isLocal ? LOCAL_CREDENTIALS_PATH : CREDENTIALS_PATH;

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(path, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

/**
 * Check if credentials exist in either local or global location.
 */
export function credentialsExist() {
  return existsSync(LOCAL_CREDENTIALS_PATH) || existsSync(CREDENTIALS_PATH);
}

/**
 * Remove credentials. Removes local first if it exists, otherwise global.
 * Returns a description of what was removed, or null if nothing found.
 */
export function removeCredentials() {
  if (existsSync(LOCAL_CREDENTIALS_PATH)) {
    unlinkSync(LOCAL_CREDENTIALS_PATH);
    return 'local';
  }
  if (existsSync(CREDENTIALS_PATH)) {
    unlinkSync(CREDENTIALS_PATH);
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
