import { getCurrentUser } from './api.js';
import {
  VARIANTS,
  getVariant,
  getVariantKey,
  SETTINGS_PATH,
  LOCAL_SETTINGS_PATH,
} from './constants.js';
import { getInitData, fetchSkillsVersion } from './update-check.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';
import { runCommand, runInteractiveCommand } from './exec.js';
import { setupClaudeCode, setupOtherIDEs } from './commands/init.js';
import { uninstallClaudePlugin, uninstallOtherIDEs } from './commands/uninstall.js';
import { printInfo, printWarning } from './banner.js';

/**
 * Detect the variant (public or teams) by fetching the current user.
 * Returns VARIANTS.public if unauthenticated or on any error.
 */
export async function detectVariant({ getUser = getCurrentUser } = {}) {
  try {
    const data = await getUser();
    const user = data.user || data;
    return getVariant(user);
  } catch {
    return VARIANTS.public;
  }
}

/**
 * Determine scope from init data location.
 * Returns 'project' if a valid local init exists (with ides and skillsVersion),
 * otherwise 'global'. Mirrors the same criteria used by getInitData().
 */
function getInitScope(readKey = readSettingsKey) {
  const local = readKey(LOCAL_SETTINGS_PATH, 'init');
  if (local?.ides?.length && local?.skillsVersion) return 'project';
  return 'global';
}

/**
 * Ensure the installed variant matches the user's organization.
 * If a mismatch is detected, uninstalls the old variant and installs the correct one.
 * Called early in commands that work with plugins/skills.
 */
export async function ensureCorrectVariant({
  getUser = getCurrentUser,
  getInit = getInitData,
  readKey = readSettingsKey,
  writeKey = writeSettingsKey,
  exec = runCommand,
  spawnInteractive = runInteractiveCommand,
  fetchVersion = fetchSkillsVersion,
} = {}) {
  const initData = getInit();
  if (!initData?.ides?.length) return null;

  let variant;
  try {
    const data = await getUser();
    const user = data.user || data;
    variant = getVariant(user);
  } catch {
    // Not authenticated — can't detect, skip
    return null;
  }

  const detectedKey = getVariantKey(variant);
  const storedKey = initData.variant || 'public';

  if (detectedKey === storedKey) return variant;

  // Mismatch detected — swap to correct variant
  const oldVariant = storedKey === 'teams' ? VARIANTS.teams : VARIANTS.public;
  const scope = getInitScope(readKey);

  printWarning(
    `Variant mismatch: ${storedKey} plugins installed, but your organization requires ${detectedKey}.`,
  );
  printInfo(`Swapping to ${detectedKey} variant...`);
  console.log('');

  // Uninstall old variant
  if (initData.ides.includes('claude')) {
    await uninstallClaudePlugin(scope, { exec, variant: oldVariant });
  }
  if (initData.ides.includes('other')) {
    await uninstallOtherIDEs(scope, { spawnInteractive, variant: oldVariant });
  }

  // Install new variant
  if (initData.ides.includes('claude')) {
    await setupClaudeCode(scope, { exec, variant });
  }
  if (initData.ides.includes('other')) {
    await setupOtherIDEs(scope, { spawnInteractive, variant });
  }

  // Update init data with new variant and version
  try {
    const versionInfo = await fetchVersion(variant.skillsVersionUrl);
    const skillsVersion = versionInfo?.version || initData.skillsVersion || '0.0.0';
    const updatedInit = { ...initData, variant: detectedKey, skillsVersion };

    if (scope === 'project') {
      writeKey(LOCAL_SETTINGS_PATH, 'init', updatedInit);
    } else {
      writeKey(SETTINGS_PATH, 'globalInit', updatedInit);
    }
  } catch {
    // Non-critical — variant will be corrected on next run
  }

  printInfo('Variant swap complete.');
  console.log('');

  return variant;
}
