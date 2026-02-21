import { getCurrentUser } from '../api.js';
import {
  checkForUpdate,
  getVersionNotification,
  getLocalVersion,
} from '../update-check.js';
import {
  printSuccess,
  printError,
  printInfo,
  printWarning,
  colorize,
} from '../banner.js';

/**
 * Core status logic, accepts dependencies for testability.
 */
export async function runStatus({
  getVersion = getLocalVersion,
  checkUpdate = checkForUpdate,
  getNotification = getVersionNotification,
  getUser = getCurrentUser,
} = {}) {
  console.log(colorize('\x1b[1m', 'Spark Status'));
  console.log('');

  // 1. Version check
  const localVersion = getVersion();
  printInfo(`Installed version: v${localVersion}`);

  try {
    const latestInfo = await checkUpdate();
    const notification = latestInfo ? getNotification(latestInfo) : null;
    if (notification) {
      printWarning(`${notification.message}`);
      console.log(`  Run ${colorize('\x1b[36m', 'spark update')} to update.`);
    } else {
      printSuccess('You are on the latest version.');
    }
  } catch {
    printWarning('Could not check for updates.');
  }

  console.log('');

  // 2. Auth check
  try {
    const data = await getUser();
    const user = data.user || data;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    printSuccess(`Authenticated as ${name || user.email || user.id || 'unknown user'}`);
  } catch {
    printError('Not authenticated.');
    console.log('');
    console.log(
      `  Run ${colorize('\x1b[36m', 'spark login')} to authenticate (opens browser).`,
    );
    console.log(
      `  Or set ${colorize('\x1b[36m', 'export SPARK_API_KEY=your_key')} with an API key.`,
    );
  }
}

/**
 * spark status — verify Spark setup and authentication.
 */
export async function statusCommand() {
  try {
    await runStatus();
  } catch (err) {
    printError(err.message);
    process.exit(1);
  }
}
