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

export const SPARK_ORG_ID = '10000000-0000-0000-0000-000000000000';

export const VARIANTS = {
  public: {
    claudePlugin: 'spark-cli@MemCo',
    skillsRepo: 'memcoai/spark-cli-skills',
    skillsVersionUrl: 'https://raw.githubusercontent.com/memcoai/spark-cli-skills/main/VERSION',
  },
  teams: {
    claudePlugin: 'spark-teams-cli@MemCo',
    skillsRepo: 'memcoai/spark-teams-cli-skills',
    skillsVersionUrl:
      'https://raw.githubusercontent.com/memcoai/spark-teams-cli-skills/main/VERSION',
  },
};

/**
 * Determine the variant (public or teams) from a user object.
 * Returns teams variant if the user belongs to a non-Spark organization.
 */
export function getVariant(user) {
  const orgId = user?.organization_id;
  if (orgId && orgId !== SPARK_ORG_ID) {
    return VARIANTS.teams;
  }
  return VARIANTS.public;
}

/**
 * Get the string key ('public' or 'teams') for a variant object.
 */
export function getVariantKey(variant) {
  return variant === VARIANTS.teams ? 'teams' : 'public';
}

/**
 * Get the variant object for a string key ('public' or 'teams').
 * Returns null if the key is not recognized.
 */
export function resolveVariant(key) {
  if (!Object.hasOwn(VARIANTS, key)) return null;
  return VARIANTS[key];
}

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
