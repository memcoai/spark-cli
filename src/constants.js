import { homedir } from 'node:os';
import { join } from 'node:path';

export const API_BASE = 'https://spark.memco.ai';
export const SPARK_DIR = join(homedir(), '.spark');
export const LOCAL_SPARK_DIR = join(process.cwd(), '.spark');
export const SETTINGS_PATH = join(SPARK_DIR, 'settings.json');
export const LOCAL_SETTINGS_PATH = join(LOCAL_SPARK_DIR, 'settings.json');
export const CALLBACK_PORT = 8789;
export const AUTH_SUCCESS_URL = 'https://spark.memco.ai/cli/auth_success';
export const AUTH_ERROR_URL = 'https://spark.memco.ai/cli/auth_error';
export const VERSION_CHECK_URL = 'https://registry.npmjs.org/@memco/spark/latest';
