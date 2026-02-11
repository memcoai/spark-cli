import { homedir } from 'os';
import { join } from 'path';

export const API_BASE = 'https://spark.memco.ai';
export const SPARK_DIR = join(homedir(), '.spark');
export const CREDENTIALS_PATH = join(SPARK_DIR, 'credentials.json');
export const CLIENT_PATH = join(SPARK_DIR, 'oauth-client.json');
export const CALLBACK_PORT = 8789;
