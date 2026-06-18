import { getCurrentUser } from './api.js';
import {
  VARIANTS,
  getVariant,
  getVariantKey,
  GLOBAL_ONLY_IDES,
  SETTINGS_PATH,
  LOCAL_SETTINGS_PATH,
} from './constants.js';
import { getInitData, fetchSkillsVersion } from './update-check.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';
import { runCommand, runInteractiveCommand } from './exec.js';
import { setupClaudeCode, setupCodex, setupOtherIDEs } from './commands/init.js';
import {
  uninstallClaudePlugin,
  uninstallCodexPlugin,
  uninstallOtherIDEs,
} from './commands/uninstall.js';
import { printInfo, printWarning } from './banner.js';

/**
 * Detect the variant (public or teams) by fetching the current user.
 * Throws on auth/network errors so callers can fall back to stored variant.
 */
export async function detectVariant({ getUser = getCurrentUser } = {}) {
  const data = await getUser();
  const user = data.user || data;
  return getVariant(user);
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
  let variant;
  try {
    const data = await getUser();
    const user = data.user || data;
    variant = getVariant(user);
  } catch {
    // Not authenticated — can't detect, skip
    return null;
  }

  const initData = getInit();
  if (!initData?.ides?.length) return variant;

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
  if (initData.ides.includes('codex')) {
    await uninstallCodexPlugin({ exec, variant: oldVariant });
  }
  if (initData.ides.includes('other')) {
    await uninstallOtherIDEs(scope, { spawnInteractive, variant: oldVariant });
  }

  // Install new variant
  if (initData.ides.includes('claude')) {
    await setupClaudeCode(scope, { exec, variant });
  }
  if (initData.ides.includes('codex')) {
    await setupCodex({ exec, variant });
  }
  if (initData.ides.includes('other')) {
    await setupOtherIDEs(scope, { spawnInteractive, variant });
  }

  // Persist the new variant. `initData` may be the merged view from getInitData() (project IDEs
  // plus global-only Codex from globalInit), so write each record's own IDEs back to its own
  // location: never persist global-only IDEs into the local record, and update globalInit's
  // variant separately so a swapped Codex isn't re-detected as a mismatch next run.
  try {
    const versionInfo = await fetchVersion(detectedKey);
    const skillsVersion = versionInfo?.version || initData.skillsVersion || '0.0.0';

    if (scope === 'project') {
      const localIdes = initData.ides.filter((k) => !GLOBAL_ONLY_IDES.includes(k));
      if (localIdes.length) {
        writeKey(LOCAL_SETTINGS_PATH, 'init', {
          ...initData,
          ides: localIdes,
          variant: detectedKey,
          skillsVersion,
        });

        // Keep this project's entry in the global projects[] array in sync, otherwise a later
        // `spark uninstall` run from another directory would act on the stale (old) variant.
        const projects = readKey(SETTINGS_PATH, 'projects');
        if (Array.isArray(projects)) {
          const idx = projects.findIndex((p) => p.path === process.cwd());
          if (idx >= 0) {
            projects[idx] = { ...projects[idx], variant: detectedKey, skillsVersion };
            writeKey(SETTINGS_PATH, 'projects', projects);
          }
        }
      }
      const globalInit = readKey(SETTINGS_PATH, 'globalInit');
      if (globalInit?.ides?.some((k) => GLOBAL_ONLY_IDES.includes(k))) {
        writeKey(SETTINGS_PATH, 'globalInit', {
          ...globalInit,
          variant: detectedKey,
          skillsVersion: versionInfo?.version || globalInit.skillsVersion || '0.0.0',
        });
      }
    } else {
      writeKey(SETTINGS_PATH, 'globalInit', { ...initData, variant: detectedKey, skillsVersion });
    }
  } catch {
    // Non-critical — variant will be corrected on next run
  }

  printInfo('Variant swap complete.');
  console.log('');

  return variant;
}
