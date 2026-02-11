/**
 * Validate and normalize a version string.
 * Strips leading 'v'. Accepts MAJOR, MAJOR.MINOR, or MAJOR.MINOR.PATCH.
 * Major and minor must be integers. Patch can have a pre-release suffix (e.g. 0-beta).
 */
function normalizeVersion(version) {
  const stripped = version.replace(/^v/, '');

  // Separate pre-release suffix (everything after first hyphen)
  const hyphenIdx = stripped.indexOf('-');
  const core = hyphenIdx === -1 ? stripped : stripped.substring(0, hyphenIdx);
  const preRelease = hyphenIdx === -1 ? '' : stripped.substring(hyphenIdx);

  const parts = core.split('.');
  if (parts.length < 1 || parts.length > 3) return null;

  // All core parts must be integers
  if (!parts.every(p => /^\d+$/.test(p))) return null;

  return parts.join('.') + preRelease;
}

/**
 * Parse tags from a comma-separated string.
 * Each tag must be TYPE:NAME or TYPE:NAME:VERSION.
 * Type and name can be any non-empty string.
 * Version, if present, must be semver (MAJOR.MINOR.PATCH).
 */
export function parseTags(input) {
  if (!input) return [];

  return input.split(',').map(raw => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(':');

    if (parts.length === 2) {
      const [type, name] = parts;
      if (!type || !name) {
        throw new Error(`Invalid tag "${trimmed}": expected TYPE:NAME or TYPE:NAME:VERSION`);
      }
      return `${type}:${name}`;
    }

    if (parts.length === 3) {
      const [type, name, version] = parts;
      if (!type || !name || !version) {
        throw new Error(`Invalid tag "${trimmed}": expected TYPE:NAME or TYPE:NAME:VERSION`);
      }
      const normalized = normalizeVersion(version);
      if (!normalized) {
        throw new Error(`Invalid version "${version}" in tag "${trimmed}": expected a numeric version (e.g. 3, 3.11, 3.11.0)`);
      }
      return `${type}:${name}:${normalized}`;
    }

    throw new Error(`Invalid tag "${trimmed}": expected TYPE:NAME or TYPE:NAME:VERSION`);
  }).filter(Boolean);
}

/**
 * Parse source URLs from comma-separated string.
 */
export function parseSources(sourcesString) {
  if (!sourcesString) return [];
  return sourcesString.split(',').map(url => url.trim()).filter(Boolean);
}
