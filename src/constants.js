import { homedir } from 'node:os';
import { join } from 'node:path';

export const API_BASE = 'https://spark.memco.ai';
export const SPARK_DIR = join(homedir(), '.spark');
export const LOCAL_SPARK_DIR = join(process.cwd(), '.spark');
export const CREDENTIALS_PATH = join(SPARK_DIR, 'credentials.json');
export const LOCAL_CREDENTIALS_PATH = join(LOCAL_SPARK_DIR, 'credentials.json');
export const CLIENT_PATH = join(SPARK_DIR, 'oauth-client.json');
export const CALLBACK_PORT = 8789;
