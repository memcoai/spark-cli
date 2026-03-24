import { tagSchema, xmlTagSchema, feedbackEntrySchema, escapeXmlAttribute } from './schemas.js';

/**
 * Validate an array of strings against a Zod schema.
 * Normalizes input to an array, validates each item, and filters empty results.
 */
function validateArray(input, schema, label) {
  if (!input) return [];
  const items = Array.isArray(input) ? input : [input];
  return items
    .map((raw) => {
      if (typeof raw !== 'string') {
        throw new TypeError(`Invalid ${label} value: expected a string but got ${typeof raw}`);
      }
      const result = schema.safeParse(raw);
      if (!result.success) {
        throw new Error(result.error.issues[0].message);
      }
      return result.data;
    })
    .filter(Boolean);
}

/**
 * Parse tags from an array of strings (from repeated --tag flags).
 * Each tag must be TYPE:NAME or TYPE:NAME:VERSION.
 */
export function parseTags(input) {
  return validateArray(input, tagSchema, 'tag');
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
 * Parse XML tags from an array of strings (from repeated --xml-tag flags).
 * Each tag must be a valid XML tag with type and name attributes.
 */
export function parseXmlTags(input) {
  return validateArray(input, xmlTagSchema, 'XML tag');
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
 * Parse feedback entries from an array of strings (from repeated --feedback flags).
 * Each entry must be a valid XML feedback tag.
 */
export function parseFeedbackEntries(input) {
  return validateArray(input, feedbackEntrySchema, 'feedback entry');
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
