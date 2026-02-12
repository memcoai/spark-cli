import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VERSION_CHECK_URL, SETTINGS_PATH } from './constants.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse a semver string into { major, minor, patch }.
 * Strips leading 'v' and ignores pre-release suffixes.
 */
export function parseSemver(version) {
  if (typeof version !== 'string') return null;
  const match = version.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two semver strings.
 * Returns 'major' | 'minor' | 'patch' | null.
 */
export function compareVersions(current, latest) {
  const cur = parseSemver(current);
  const lat = parseSemver(latest);
  if (!cur || !lat) return null;
  if (lat.major > cur.major) return 'major';
  if (lat.major === cur.major && lat.minor > cur.minor) return 'minor';
  if (lat.major === cur.major && lat.minor === cur.minor && lat.patch > cur.patch) return 'patch';
  return null;
}

/**
 * Get the current local package version.
 */
export function getLocalVersion() {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
  return pkg.version;
}

/**
 * Read cached version info from global settings.json.
 */
export function getCachedVersion() {
  return readSettingsKey(SETTINGS_PATH, 'latestVersion');
}

/**
 * Fetch the latest version from GitHub and cache it.
 * Catches all errors silently — never blocks the CLI.
 */
export async function fetchLatestVersion() {
  try {
    const response = await fetch(VERSION_CHECK_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.version) return null;
    const result = { version: data.version, checkedAt: Date.now() };
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
  const updateType = compareVersions(current, latestInfo.version);
  if (!updateType) return null;

  const latest = latestInfo.version;

  if (updateType === 'major') {
    return {
      type: 'major',
      message:
        `Spark CLI v${latest} is available (current: v${current}). This is a major update.\n` +
        'Please update: npm install -g @memco/spark',
    };
  }

  return {
    type: updateType,
    message: `Update available: v${current} → v${latest}. Run: npm install -g @memco/spark`,
  };
}
