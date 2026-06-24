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
import { IDES } from './ides.js';

/**
 * Per-IDE variant-swap handlers, keyed by canonical IDE key. The swap removes the old
 * variant's plugin/skills then installs the new variant's; both halves route through the
 * table so the per-IDE command + scope rules live in one place.
 */
const SWAP_BY_KEY = {
  claude: {
    uninstall: (scope, { exec, variant }) => uninstallClaudePlugin(scope, { exec, variant }),
    install: (scope, { exec, variant }) => setupClaudeCode(scope, { exec, variant }),
  },
  codex: {
    uninstall: (scope, { exec, variant }) => uninstallCodexPlugin({ exec, variant }),
    install: (scope, { exec, variant }) => setupCodex({ exec, variant }),
  },
  other: {
    uninstall: (scope, { spawnInteractive, variant }) =>
      uninstallOtherIDEs(scope, { spawnInteractive, variant }),
    install: (scope, { spawnInteractive, variant }) =>
      setupOtherIDEs(scope, { spawnInteractive, variant }),
  },
};

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
 * Run the per-IDE plugin/skills swap: uninstall the old variant from every configured
 * IDE, then install the new variant. Routed through SWAP_BY_KEY so the per-IDE command
 * + scope rules stay in one place.
 */
async function swapVariant(initData, scope, { exec, spawnInteractive, oldVariant, variant }) {
  for (const ide of IDES) {
    if (!initData.ides.includes(ide.key)) continue;
    await SWAP_BY_KEY[ide.key].uninstall(scope, { exec, spawnInteractive, variant: oldVariant });
  }
  for (const ide of IDES) {
    if (!initData.ides.includes(ide.key)) continue;
    await SWAP_BY_KEY[ide.key].install(scope, { exec, spawnInteractive, variant });
  }
}

/**
 * Keep this project's entry in the global `projects[]` array in sync after a swap,
 * otherwise a later `spark uninstall` from another directory would act on the stale
 * (old) variant.
 */
function syncProjectsArray({ detectedKey, skillsVersion, readKey, writeKey }) {
  const projects = readKey(SETTINGS_PATH, 'projects');
  if (!Array.isArray(projects)) return;
  const idx = projects.findIndex((p) => p.path === process.cwd());
  if (idx < 0) return;
  projects[idx] = { ...projects[idx], variant: detectedKey, skillsVersion };
  writeKey(SETTINGS_PATH, 'projects', projects);
}

/**
 * Persist the swapped variant into the LOCAL project init record (never persisting
 * global-only IDEs there) and sync the global projects[] entry.
 */
function persistProjectVariant({ initData, detectedKey, skillsVersion, readKey, writeKey }) {
  const localIdes = initData.ides.filter((k) => !GLOBAL_ONLY_IDES.includes(k));
  if (!localIdes.length) return;
  writeKey(LOCAL_SETTINGS_PATH, 'init', {
    ...initData,
    ides: localIdes,
    variant: detectedKey,
    skillsVersion,
  });
  syncProjectsArray({ detectedKey, skillsVersion, readKey, writeKey });
}

/**
 * Update globalInit's variant separately so a swapped global-only IDE (Codex) isn't
 * re-detected as a mismatch next run. Uses globalInit's own skills version as the
 * fallback (distinct from the project record's).
 */
function persistGlobalOnlyVariant({ detectedKey, versionInfo, readKey, writeKey }) {
  const globalInit = readKey(SETTINGS_PATH, 'globalInit');
  if (!globalInit?.ides?.some((k) => GLOBAL_ONLY_IDES.includes(k))) return;
  writeKey(SETTINGS_PATH, 'globalInit', {
    ...globalInit,
    variant: detectedKey,
    skillsVersion: versionInfo?.version || globalInit.skillsVersion || '0.0.0',
  });
}

/**
 * Persist the new variant after a swap. `initData` may be the merged view from
 * getInitData() (project IDEs plus global-only Codex from globalInit), so each record's
 * own IDEs are written back to its own location. Non-critical: a failure here just means
 * the variant is corrected on the next run.
 */
async function persistSwappedVariant({
  scope,
  initData,
  detectedKey,
  readKey,
  writeKey,
  fetchVersion,
}) {
  try {
    const versionInfo = await fetchVersion(detectedKey);
    const skillsVersion = versionInfo?.version || initData.skillsVersion || '0.0.0';

    if (scope === 'project') {
      persistProjectVariant({ initData, detectedKey, skillsVersion, readKey, writeKey });
      persistGlobalOnlyVariant({ detectedKey, versionInfo, readKey, writeKey });
    } else {
      writeKey(SETTINGS_PATH, 'globalInit', { ...initData, variant: detectedKey, skillsVersion });
    }
  } catch {
    // Non-critical — variant will be corrected on next run
  }
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
    variant = getVariant(data.user || data);
  } catch {
    // Not authenticated — can't detect, skip
    return null;
  }

  const initData = getInit();
  if (!initData?.ides?.length) return variant;

  const detectedKey = getVariantKey(variant);
  const storedKey = initData.variant || 'public';
  if (detectedKey === storedKey) return variant;

  // Mismatch detected — swap to the correct variant.
  const oldVariant = storedKey === 'teams' ? VARIANTS.teams : VARIANTS.public;
  const scope = getInitScope(readKey);

  printWarning(
    `Variant mismatch: ${storedKey} plugins installed, but your organization requires ${detectedKey}.`,
  );
  printInfo(`Swapping to ${detectedKey} variant...`);
  console.log('');

  await swapVariant(initData, scope, { exec, spawnInteractive, oldVariant, variant });
  await persistSwappedVariant({ scope, initData, detectedKey, readKey, writeKey, fetchVersion });

  printInfo('Variant swap complete.');
  console.log('');

  return variant;
}
