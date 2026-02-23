import { getCurrentUser } from '../api.js';
import {
  checkForUpdate,
  getVersionNotification,
  getLocalVersion,
  checkSkillsVersion,
  getSkillsNotification,
  getInitData,
} from '../update-check.js';
import { printSuccess, printError, printInfo, printWarning, colorize } from '../banner.js';

const IDE_LABELS = { claude: 'Claude Code', other: 'Cursor/Windsurf' };

function ideKeyToLabel(key) {
  return IDE_LABELS[key] || key;
}

/**
 * Print skills version status.
 */
async function printSkillsStatus(initData, checkSkills, getSkillsNote) {
  if (!Array.isArray(initData.ides) || initData.ides.length === 0) {
    printInfo('No IDEs configured for skills. Run spark init to configure your IDE.');
    return;
  }
  const ideLabels = initData.ides.map(ideKeyToLabel).join(', ');
  printInfo(`Skills configured for: ${ideLabels}`);

  if (initData.skillsVersion) {
    printInfo(`Installed skills version: v${String(initData.skillsVersion).replace(/^[vV]/, '')}`);
  }

  try {
    const latestSkills = await checkSkills();
    const skillsNote = latestSkills ? getSkillsNote(latestSkills, initData) : null;
    if (skillsNote) {
      printWarning(skillsNote.message);
    } else if (latestSkills) {
      printSuccess('Skills are up to date.');
    }
  } catch {
    printWarning('Could not check for skills updates.');
  }
}

/**
 * Core status logic, accepts dependencies for testability.
 */
export async function runStatus({
  getVersion = getLocalVersion,
  checkUpdate = checkForUpdate,
  getNotification = getVersionNotification,
  getUser = getCurrentUser,
  checkSkills = checkSkillsVersion,
  getSkillsNote = getSkillsNotification,
  getInit = getInitData,
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
    const orgName = user.organization_name;
    if (orgName && orgName !== 'Spark') {
      printInfo(`Organization: ${orgName}`);
    } else {
      printInfo('Environment: Public');
    }
  } catch {
    printError('Not authenticated.');
    console.log('');
    console.log(`  Run ${colorize('\x1b[36m', 'spark login')} to authenticate (opens browser).`);
    console.log(
      `  Or set ${colorize('\x1b[36m', 'export SPARK_API_KEY=your_key')} with an API key.`,
    );
  }

  console.log('');

  // 3. Skills version check
  const initData = getInit();
  if (initData) {
    await printSkillsStatus(initData, checkSkills, getSkillsNote);
  } else {
    printInfo('No skills configured. Run spark init to set up your IDE.');
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
