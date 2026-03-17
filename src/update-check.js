import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import semver from 'semver';
import {
  getApiBase,
  VERSION_CHECK_URL,
  VARIANTS,
  SETTINGS_PATH,
  LOCAL_SETTINGS_PATH,
} from './constants.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';
import { npmVersionResponseSchema, compatibilityDataSchema } from './schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

// ──────────────────────────────────────────────
// Shared
// ──────────────────────────────────────────────

/**
 * Get the current local package version.
 */
export function getLocalVersion() {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
  return pkg.version;
}

// ──────────────────────────────────────────────
// npm update check (is a newer version published?)
// ──────────────────────────────────────────────

/**
 * Read cached version info from global settings.json.
 */
export function getCachedVersion() {
  return readSettingsKey(SETTINGS_PATH, 'latestVersion');
}

/**
 * Fetch the latest version from npm and cache it.
 * Catches all errors silently — never blocks the CLI.
 */
export async function fetchLatestVersion() {
  try {
    const response = await fetch(VERSION_CHECK_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const raw = await response.json();
    const parsed = npmVersionResponseSchema.safeParse(raw);
    if (!parsed.success) return null;
    const result = { version: parsed.data.version, checkedAt: Date.now() };
    writeSettingsKey(SETTINGS_PATH, 'latestVersion', result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Check for updates. Returns cached data if fresh (<24h), otherwise fetches.
 * Never rejects.
 */
export async function checkForUpdate() {
  try {
    const cached = getCachedVersion();
    if (cached?.version && cached.checkedAt && Date.now() - cached.checkedAt < ONE_DAY_MS) {
      return cached;
    }
    return await fetchLatestVersion();
  } catch {
    return null;
  }
}

/**
 * Build the notification for a version update.
 * Returns { type, message } or null.
 */
export function getVersionNotification(latestInfo) {
  if (!latestInfo?.version) return null;
  const current = getLocalVersion();
  const latest = latestInfo.version;

  const cur = semver.valid(semver.coerce(current));
  const lat = semver.valid(semver.coerce(latest));
  if (!cur || !lat || !semver.lt(cur, lat)) return null;

  return {
    type: 'update',
    message: `Update available: v${current} \u2192 v${latest}. Run: spark update`,
  };
}

// ──────────────────────────────────────────────
// Backend compatibility check (block / deprecation)
// ──────────────────────────────────────────────

/**
 * Read cached compatibility data from global settings.json.
 * Returns { data, checkedAt } or null.
 */
export function getCachedCompatibility() {
  return readSettingsKey(SETTINGS_PATH, 'compatibility');
}

/**
 * Fetch compatibility info from the backend and cache it.
 * Returns { data, checkedAt } or null on failure. Never rejects.
 */
export async function fetchCompatibility() {
  try {
    const response = await fetch(`${getApiBase()}/api/cli/compatibility`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const raw = await response.json();
    const parsed = compatibilityDataSchema.safeParse(raw);
    if (!parsed.success) return null;
    const data = parsed.data;
    if (!data.minimum_version && !data.deprecations) return null;
    const result = { data, checkedAt: Date.now() };
    writeSettingsKey(SETTINGS_PATH, 'compatibility', result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Check compatibility. Returns cached data if fresh (<4h), otherwise fetches.
 * Never rejects.
 */
export async function checkCompatibility() {
  try {
    const cached = getCachedCompatibility();
    if (cached?.data && cached.checkedAt && Date.now() - cached.checkedAt < FOUR_HOURS_MS) {
      return cached;
    }
    return await fetchCompatibility();
  } catch {
    return null;
  }
}

/**
 * Coerce and validate a version string. Returns a valid semver string or null.
 */
function coerceVersion(version) {
  return semver.valid(semver.coerce(version));
}

/**
 * Check if a coerced semver string is below the given version string.
 */
function isBelow(local, version) {
  const target = coerceVersion(version);
  return target && semver.lt(local, target);
}

/**
 * Find the first deprecation entry that applies to the local version.
 */
function findDeprecation(local, deprecations) {
  if (!Array.isArray(deprecations)) return null;
  for (const dep of deprecations) {
    if (dep.version_below && isBelow(local, dep.version_below)) {
      return dep;
    }
  }
  return null;
}

/**
 * Evaluate the compatibility response against the local version.
 *
 * Returns {
 *   blocked: boolean,        — true if localVersion < minimum_version
 *   deprecation: object|null — matching deprecation entry, if any
 *   messages: string[]       — message strings to display
 * }
 */
// ──────────────────────────────────────────────
// Skills version check (is the installed skill outdated?)
// ──────────────────────────────────────────────

/**
 * Read cached skills version info from global settings.json.
 */
export function getCachedSkillsVersion() {
  return readSettingsKey(SETTINGS_PATH, 'skillsVersion');
}

/**
 * Fetch the latest skills version from GitHub and cache it.
 * The VERSION file contains a plain version string (e.g. "1.0.0\n").
 * Never rejects.
 */
export async function fetchSkillsVersion(variantKey = 'public') {
  try {
    const v = VARIANTS[variantKey] || VARIANTS.public;
    const response = await fetch(v.skillsVersionUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    const version = text.trim();
    if (!version) return null;
    const result = { version, checkedAt: Date.now(), variant: variantKey };
    writeSettingsKey(SETTINGS_PATH, 'skillsVersion', result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Check for skills updates. Returns cached data if fresh (<24h), otherwise fetches.
 * Never rejects.
 */
export async function checkSkillsVersion(variantKey = 'public') {
  try {
    const cached = getCachedSkillsVersion();
    if (cached?.version && cached.checkedAt && Date.now() - cached.checkedAt < ONE_DAY_MS) {
      // Ensure cache is for the requested variant
      const cachedVariant = cached.variant || 'public';
      if (cachedVariant === variantKey) {
        return cached;
      }
    }
    return await fetchSkillsVersion(variantKey);
  } catch {
    return null;
  }
}

/**
 * Read init data for the current project/global scope.
 * Checks local .spark/settings.json first, then global globalInit.
 * Returns { ides, skillsVersion } or null.
 */
export function getInitData() {
  const local = readSettingsKey(LOCAL_SETTINGS_PATH, 'init');
  if (local?.ides?.length && local.skillsVersion) return local;

  const global = readSettingsKey(SETTINGS_PATH, 'globalInit');
  if (global?.ides?.length && global.skillsVersion) return global;

  return null;
}

/**
 * Build a notification for skills version update.
 * Returns { type, message } or null.
 */
export function getSkillsNotification(latestInfo, initData, variant = VARIANTS.public) {
  if (!latestInfo?.version || !initData?.skillsVersion || !initData?.ides?.length) return null;

  const installed = semver.valid(semver.coerce(initData.skillsVersion));
  const latest = semver.valid(semver.coerce(latestInfo.version));
  if (!installed || !latest || !semver.lt(installed, latest)) return null;

  const lines = [
    `Skills update available: v${String(initData.skillsVersion).replace(/^[vV]/, '')} \u2192 v${String(latestInfo.version).replace(/^[vV]/, '')}`,
  ];

  const ides = initData.ides;
  if (ides.includes('claude')) {
    lines.push(`  Claude Code: claude plugin update ${variant.claudePlugin}`);
  }
  if (ides.includes('other')) {
    lines.push(`  Cursor/Windsurf: npx skills update ${variant.skillsRepo}`);
  }

  return { type: 'skills-update', message: lines.join('\n') };
}

export function evaluateCompatibility(localVersion, compatibility) {
  const result = { blocked: false, deprecation: null, messages: [] };

  if (!compatibility || !localVersion) return result;

  const local = coerceVersion(localVersion);
  if (!local) return result;

  // Check blocked (below minimum_version)
  if (compatibility.minimum_version && isBelow(local, compatibility.minimum_version)) {
    result.blocked = true;
    result.messages.push(
      `Spark CLI v${localVersion} is no longer supported. Minimum required: v${compatibility.minimum_version}.\n` +
        'Please update: spark update',
    );
  }

  // Check deprecations
  const dep = findDeprecation(local, compatibility.deprecations);
  if (dep) {
    result.deprecation = dep;
    result.messages.push(dep.message || `Versions below ${dep.version_below} are deprecated.`);
  }

  // Append the backend message field when blocked or deprecated
  if ((result.blocked || result.deprecation) && compatibility.message) {
    result.messages.push(compatibility.message);
  }

  return result;
}
