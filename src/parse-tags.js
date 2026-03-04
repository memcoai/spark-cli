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
 * Format: TYPE:NAME or TYPE:NAME:VERSION (exactly one or two ':' separators).
 * Type and name must be non-empty strings that do not contain ':'.
 * Version, if present, must be numeric (MAJOR, MAJOR.MINOR, or MAJOR.MINOR.PATCH). PATCH can be a string.
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
 * Validate and parse a single XML tag string.
 * Accepts: <tag type="..." name="..." /> or <tag type="..." name="..." version="..." />
 * Attributes may appear in any order. Returns the normalized canonical XML string.
 */
function parseXmlTag(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tagMatch = /^<tag\s+((?:\w+="[^"]*"\s*)+)\/>$/.exec(trimmed);
  if (!tagMatch) {
    throw new Error(
      `Invalid XML tag "${trimmed}": expected <tag type="..." name="..." /> or <tag type="..." name="..." version="..." />`,
    );
  }

  const attrs = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(tagMatch[1])) !== null) {
    attrs[match[1]] = match[2];
  }

  if (!attrs.type) {
    throw new Error(`Invalid XML tag "${trimmed}": missing required "type" attribute`);
  }
  if (!attrs.name) {
    throw new Error(`Invalid XML tag "${trimmed}": missing required "name" attribute`);
  }

  const allowed = new Set(['type', 'name', 'version']);
  for (const key of Object.keys(attrs)) {
    if (!allowed.has(key)) {
      throw new Error(`Invalid XML tag "${trimmed}": unknown attribute "${key}"`);
    }
  }

  if (attrs.version) {
    return `<tag type="${attrs.type}" name="${attrs.name}" version="${attrs.version}" />`;
  }
  return `<tag type="${attrs.type}" name="${attrs.name}" />`;
}

/**
 * Parse XML tags from an array of strings (from repeated --xml-tag flags).
 * Each tag must be a valid XML tag with type and name attributes.
 */
export function parseXmlTags(input) {
  if (!input) return [];
  const tags = Array.isArray(input) ? input : [input];
  return tags.map(parseXmlTag).filter(Boolean);
}

/**
 * Collect and merge tags from --tag and --xml-tag options.
 * Returns a single array of XML tag strings ready for the API.
 */
export function collectTags(options = {}) {
  const fromColon = tagsToXml(parseTags(options.tag));
  const fromXml = parseXmlTags(options.xmlTag);
  return [...fromColon, ...fromXml];
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
