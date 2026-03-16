import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { settingsSchema } from './schemas.js';

/**
 * Read the full settings object from a settings.json path.
 * Returns null if the file does not exist or is invalid JSON.
 */
export function readSettings(settingsPath) {
  if (!existsSync(settingsPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const result = settingsSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Write the full settings object to a settings.json path.
 * Creates the parent directory if needed.
 */
export function writeSettings(settingsPath, settings) {
  const dir = dirname(settingsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

/**
 * Read a single key from settings.json.
 * Returns the value or null.
 */
export function readSettingsKey(settingsPath, key) {
  const settings = readSettings(settingsPath);
  return settings?.[key] ?? null;
}

/**
 * Merge a key-value pair into settings.json (read-modify-write).
 * If value is null, the key is removed.
 */
export function writeSettingsKey(settingsPath, key, value) {
  const settings = readSettings(settingsPath) || {};
  if (value === null) {
    delete settings[key];
  } else {
    settings[key] = value;
  }
  writeSettings(settingsPath, settings);
}
