import { getMarketplaceName } from './constants.js';

/**
 * Single source of truth for per-IDE metadata.
 *
 * The lifecycle commands (init, enable, disable, uninstall, update) and the variant
 * swapper all branch over the same set of IDEs (Claude Code, Codex, Cursor/Windsurf).
 * Each descriptor captures the data those sites genuinely differ on:
 *   - `key`        canonical short key stored in init data (`claude` / `codex` / `other`)
 *   - `label`      display label shown in the `spark init` IDE checklist; `init.js`
 *                  dispatches on this label, so the table maps label <-> key.
 *   - `globalOnly` Codex plugins have no project/user scope; they are always tracked
 *                  in `globalInit` and per-project teardown never touches them.
 *   - `update`     the skills/plugin update step run by `spark update` — IDE-specific
 *                  spinner/info copy and the command that performs the update. Codex
 *                  uses `plugin marketplace upgrade <name>`, the others a plain update.
 *
 * Install (`setupClaudeCode`/`setupCodex`/`setupOtherIDEs`) and uninstall
 * (`uninstallClaudePlugin`/`uninstallCodexPlugin`/`uninstallOtherIDEs`) functions
 * keep living in their command files (they own the spinner UX + manual-fallback
 * hints); the dispatch sites iterate this table and invoke the matching helper via a
 * per-site hook. This keeps IDE metadata in one place without forcing the install,
 * uninstall, and update flows — which differ in real ways — to look identical.
 */

/**
 * Update step for the Claude Code plugin via `claude plugin update`.
 */
function updateClaude({ exec, variant, spinner, warn }) {
  const s = spinner('Updating Spark plugin for Claude Code...');
  return exec('claude', ['plugin', 'update', variant.claudePlugin])
    .then(() => {
      s.stop('Spark plugin updated for Claude Code');
      return true;
    })
    .catch((err) => {
      s.fail('Failed to update Spark plugin for Claude Code');
      warn(err.stderr?.trim() || err.message);
      return false;
    });
}

/**
 * Update step for the Codex plugin via `codex plugin marketplace upgrade <name>`.
 * Codex refreshes via a marketplace upgrade rather than a per-plugin update verb.
 */
function updateCodex({ exec, variant, spinner, warn }) {
  const s = spinner('Updating Spark plugin for Codex...');
  return exec('codex', ['plugin', 'marketplace', 'upgrade', getMarketplaceName(variant)])
    .then(() => {
      s.stop('Spark plugin updated for Codex');
      return true;
    })
    .catch((err) => {
      s.fail('Failed to update Spark plugin for Codex');
      warn(err.stderr?.trim() || err.message);
      return false;
    });
}

/**
 * Update step for other IDEs (Cursor/Windsurf) via `npx skills update`.
 * Uses plain info logging (interactive spawn) instead of a spinner.
 */
function updateOther({ spawnInteractive, variant, info, warn }) {
  info('Updating Spark skills for Cursor/Windsurf...');
  return spawnInteractive('npx', ['skills', 'update', variant.skillsRepo])
    .then(() => {
      info('Spark skills updated for Cursor/Windsurf');
      return true;
    })
    .catch((err) => {
      warn(`Failed to update skills: ${err.message}`);
      return false;
    });
}

/**
 * Ordered IDE descriptor table. Order matches the `spark init` checklist and the
 * original per-site dispatch order so iteration is behavior-preserving.
 */
export const IDES = [
  {
    key: 'claude',
    label: 'Claude Code',
    globalOnly: false,
    update: updateClaude,
  },
  {
    key: 'codex',
    label: 'Codex',
    globalOnly: true,
    update: updateCodex,
  },
  {
    key: 'other',
    label: 'Other (Cursor, Windsurf, etc.)',
    globalOnly: false,
    update: updateOther,
  },
];

/** Descriptors keyed by canonical short key. */
export const IDE_BY_KEY = Object.fromEntries(IDES.map((ide) => [ide.key, ide]));

/** Descriptors keyed by display label (init dispatches on labels). */
export const IDE_BY_LABEL = Object.fromEntries(IDES.map((ide) => [ide.label, ide]));

/** Display labels in checklist order. */
export const IDE_LABELS = IDES.map((ide) => ide.label);

/** Map a display label to its canonical key (passthrough when already a key/unknown). */
export function labelToKey(label) {
  return IDE_BY_LABEL[label]?.key ?? label;
}
