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
    // Marketplace CLI plugin id — installed the same way by Claude Code and Codex.
    claudePlugin: 'spark-cli@MemCo',
    skillsRepo: 'memcoai/spark-cli-skills',
    skillsVersionUrl: 'https://raw.githubusercontent.com/memcoai/spark-cli-skills/main/VERSION',
  },
  teams: {
    // Marketplace renamed the plugin to spark-team-cli; the skills repo keeps the older name.
    claudePlugin: 'spark-team-cli@MemCo',
    skillsRepo: 'memcoai/spark-teams-cli-skills',
    skillsVersionUrl:
      'https://raw.githubusercontent.com/memcoai/spark-teams-cli-skills/main/VERSION',
  },
};

/**
 * IDE keys whose plugins are inherently global (no project/user scope). These are always
 * recorded in `globalInit` regardless of the chosen install scope, so a single global record
 * governs install/removal and per-project teardown never touches the shared plugin.
 */
export const GLOBAL_ONLY_IDES = ['codex'];

/**
 * Get the marketplace name a variant's plugin is installed from — the part after '@'
 * in the plugin id (e.g. 'spark-cli@MemCo' -> 'MemCo').
 * Used for `codex plugin marketplace upgrade <name>`.
 */
export function getMarketplaceName(variant) {
  return variant.claudePlugin.split('@')[1];
}

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
 * Strip trailing slash(es) from an API base URL string. Behavior-preserving
 * canonical home for the `replace(/\/+$/, '')` normalization that was duplicated
 * across api.js, credentials.js, oauth.js, mcp-client.js, and validateApiBase.
 *
 * This does NOT validate or trim — it is distinct from `validateApiBase` (which
 * trims, validates protocol/URL shape, and returns `undefined` for malformed
 * input). Returns the input unchanged (sans trailing slashes) for strings, or
 * `null` for non-strings.
 *
 * @param {*} base
 * @returns {string|null}
 */
export function normalizeApiBase(base) {
  return typeof base === 'string' ? base.replace(/\/+$/, '') : null;
}

/**
 * Validate and normalize an API base URL string.
 * Returns the trimmed, trailing-slash-stripped string, or undefined if invalid/empty.
 */
export function validateApiBase(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = normalizeApiBase(value.trim());
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
