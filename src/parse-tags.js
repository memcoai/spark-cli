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
  if (!parts.every((p) => /^\d+$/.test(p))) return null;

  return parts.join('.') + preRelease;
}

/**
 * Validate and parse a single tag string.
 * Format: TYPE:NAME or TYPE:NAME:VERSION.
 * Type and name can be any non-empty string.
 * Version, if present, must be numeric (MAJOR, MAJOR.MINOR, or MAJOR.MINOR.PATCH).
 */
function parseTag(raw) {
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
      throw new Error(
        `Invalid version "${version}" in tag "${trimmed}": expected a numeric version (e.g. 3, 3.11, 3.11.0)`,
      );
    }
    return `${type}:${name}:${normalized}`;
  }

  throw new Error(`Invalid tag "${trimmed}": expected TYPE:NAME or TYPE:NAME:VERSION`);
}

/**
 * Parse tags from an array of strings (from repeated --tag flags).
 * Each tag must be TYPE:NAME or TYPE:NAME:VERSION.
 */
export function parseTags(input) {
  if (!input) return [];

  const tags = Array.isArray(input) ? input : [input];
  return tags.map(parseTag).filter(Boolean);
}

function escapeXmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Convert parsed colon-format tags to XML tag strings.
 * Input: ['language:python:3.11', 'task_type:bug_fix']
 * Output: ['<tag type="language" name="python" version="3.11" />', '<tag type="task_type" name="bug_fix" />']
 */
export function tagsToXml(tags) {
  if (!tags || tags.length === 0) return [];

  return tags.map((tag) => {
    const parts = tag.split(':');
    const type = escapeXmlAttribute(parts[0]);
    const name = escapeXmlAttribute(parts[1]);
    if (parts.length === 2) {
      return `<tag type="${type}" name="${name}" />`;
    }
    const version = escapeXmlAttribute(parts.slice(2).join(':'));
    return `<tag type="${type}" name="${name}" version="${version}" />`;
  });
}

/**
 * Parse source URLs from comma-separated string.
 */
export function parseSources(sourcesString) {
  if (!sourcesString) return [];
  return sourcesString
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}
