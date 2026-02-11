import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { SPARK_DIR, CREDENTIALS_PATH } from './constants.js';

/**
 * Load credentials from file
 */
export function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Save credentials to file
 */
export function saveCredentials(credentials) {
  if (!existsSync(SPARK_DIR)) {
    mkdirSync(SPARK_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), { mode: 0o600 });
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
