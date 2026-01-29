import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getCurrentUser } from '../api.js';
import { output, outputError, outputSuccess } from '../output.js';
import { printBanner, printSuccess, printInfo } from '../banner.js';

const SPARK_DIR = join(homedir(), '.spark');
const CREDENTIALS_PATH = join(SPARK_DIR, 'credentials.json');

/**
 * Login command handler
 * Opens browser for OAuth flow (placeholder for now)
 */
export async function loginCommand(options, command) {
  try {
    // Show the banner
    printBanner();

    console.log('');
    console.log('\x1b[1mSpark CLI Authentication\x1b[0m');
    console.log('========================');
    console.log('');
    console.log('\x1b[33mOption 1:\x1b[0m Set environment variable');
    console.log('  export SPARK_API_KEY=your_api_key');
    console.log('');
    console.log('\x1b[33mOption 2:\x1b[0m Create credentials file');
    console.log(`  mkdir -p ${SPARK_DIR}`);
    console.log(`  echo '{"apiKey":"your_api_key"}' > ${CREDENTIALS_PATH}`);
    console.log('');
    console.log('\x1b[33mOption 3:\x1b[0m Pass API key directly');
    console.log('  spark --api-key your_api_key query "error message"');
    console.log('');
    console.log('\x1b[36mTo get an API key, visit:\x1b[0m https://spark.memco.ai/settings/api');
    console.log('');

    // Check if we're already authenticated
    const apiKey = process.env.SPARK_API_KEY;
    if (apiKey) {
      printSuccess('Authenticated via SPARK_API_KEY environment variable');
    } else if (existsSync(CREDENTIALS_PATH)) {
      printSuccess('Credentials file exists');
    } else {
      printInfo('Not authenticated');
    }
  } catch (err) {
    outputError(err, command);
  }
}

/**
 * Logout command handler
 */
export async function logoutCommand(options, command) {
  try {
    if (existsSync(CREDENTIALS_PATH)) {
      unlinkSync(CREDENTIALS_PATH);
      outputSuccess('Logged out successfully. Credentials file removed.', {}, command);
    } else {
      output({
        success: true,
        message: 'No credentials file found. You may still be authenticated via SPARK_API_KEY environment variable.',
      }, command);
    }
  } catch (err) {
    outputError(err, command);
  }
}

/**
 * Whoami command handler
 */
export async function whoamiCommand(options, command) {
  try {
    const user = await getCurrentUser(command);
    output(user, command);
  } catch (err) {
    // If we get an error, check what auth method is being used
    const apiKey = process.env.SPARK_API_KEY;
    if (apiKey) {
      output({
        authenticated: true,
        method: 'environment_variable',
        message: 'Authenticated via SPARK_API_KEY, but could not fetch user info',
        error: err.message,
      }, command);
    } else if (existsSync(CREDENTIALS_PATH)) {
      output({
        authenticated: true,
        method: 'credentials_file',
        message: 'Credentials file exists, but could not fetch user info',
        error: err.message,
      }, command);
    } else {
      output({
        authenticated: false,
        message: 'Not authenticated. Run `spark login` for instructions.',
      }, command);
    }
  }
}

/**
 * Save credentials to file (used by OAuth callback)
 */
export function saveCredentials(credentials) {
  if (!existsSync(SPARK_DIR)) {
    mkdirSync(SPARK_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}
