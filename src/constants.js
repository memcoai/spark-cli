import { homedir } from 'node:os';
import { join } from 'node:path';
import { readSettingsKey } from './settings.js';

export const DEFAULT_API_BASE = 'https://spark.memco.ai';
export const SPARK_DIR = join(homedir(), '.spark');
export const LOCAL_SPARK_DIR = join(process.cwd(), '.spark');
export const SETTINGS_PATH = join(SPARK_DIR, 'settings.json');
export const LOCAL_SETTINGS_PATH = join(LOCAL_SPARK_DIR, 'settings.json');
export const CALLBACK_PORT = 8789;
export const AUTH_SUCCESS_URL = 'https://spark.memco.ai/cli/auth_success';
export const AUTH_ERROR_URL = 'https://spark.memco.ai/cli/auth_error';
export const VERSION_CHECK_URL = 'https://registry.npmjs.org/@memco/spark/latest';
export const SKILLS_VERSION_URL =
  'https://raw.githubusercontent.com/memcoai/spark-cli-skills/main/VERSION';

/**
 * Get the active API base URL.
 * Priority: SPARK_API_BASE env var > local settings > global settings > default.
 */
export function getApiBase() {
  if (process.env.SPARK_API_BASE) {
    return process.env.SPARK_API_BASE.replace(/\/+$/, '');
  }
  const localApiBase = readSettingsKey(LOCAL_SETTINGS_PATH, 'apiBase');
  if (localApiBase) return localApiBase.replace(/\/+$/, '');
  const globalApiBase = readSettingsKey(SETTINGS_PATH, 'apiBase');
  if (globalApiBase) return globalApiBase.replace(/\/+$/, '');
  return DEFAULT_API_BASE;
}
