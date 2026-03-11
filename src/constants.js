import { homedir } from 'node:os';
import { join } from 'node:path';
import { readSettingsKey } from './settings.js';

export const DEFAULT_API_BASE = 'https://spark.memco.ai';
export const SPARK_DIR = join(homedir(), '.spark');
export const LOCAL_SPARK_DIR = join(process.cwd(), '.spark');
export const SETTINGS_PATH = join(SPARK_DIR, 'settings.json');
export const LOCAL_SETTINGS_PATH = join(LOCAL_SPARK_DIR, 'settings.json');
export const CALLBACK_PORT = 8789;
export function getAuthSuccessUrl(apiBase) {
  return `${apiBase || getApiBase()}/cli/auth_success`;
}
export function getAuthErrorUrl(apiBase) {
  return `${apiBase || getApiBase()}/cli/auth_error`;
}
export const VERSION_CHECK_URL = 'https://registry.npmjs.org/@memco/spark/latest';
export const SKILLS_VERSION_URL =
  'https://raw.githubusercontent.com/memcoai/spark-cli-skills/main/VERSION';

/**
 * Validate and normalize an API base URL string.
 * Returns the trimmed, trailing-slash-stripped string, or undefined if invalid/empty.
 */
export function validateApiBase(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\/+$/, '');
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return normalized;
  } catch {
    return undefined;
  }
}

/**
 * Get the active API base URL.
 * Priority: SPARK_API_BASE env var > local settings > global settings > default.
 */
export function getApiBase() {
  const envBase = validateApiBase(process.env.SPARK_API_BASE);
  if (envBase) return envBase;
  const localApiBase = validateApiBase(readSettingsKey(LOCAL_SETTINGS_PATH, 'apiBase'));
  if (localApiBase) return localApiBase;
  const globalApiBase = validateApiBase(readSettingsKey(SETTINGS_PATH, 'apiBase'));
  if (globalApiBase) return globalApiBase;
  return DEFAULT_API_BASE;
}
