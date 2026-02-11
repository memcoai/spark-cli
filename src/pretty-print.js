import { formatMarkdown } from './format-markdown.js';
import { colorize } from './banner.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

/**
 * Convert a key name to a readable label.
 * snake_case and camelCase → Title Case
 */
function formatLabel(key) {
  return key
    .replaceAll(/([A-Z])/g, ' $1')
    .replaceAll(/[_-]/g, ' ')
    .replaceAll(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Format a single value for terminal display.
 */
function formatValue(value, indent = 0) {
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) {
    return colorize(DIM, 'none');
  }
  if (typeof value === 'boolean') {
    return value ? colorize(GREEN, 'yes') : colorize(RED, 'no');
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return formatMarkdown(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return colorize(DIM, '(empty)');
    return value
      .map((item, i) => {
        if (typeof item === 'object' && item !== null) {
          return `${pad}${colorize(DIM, `[${i + 1}]`)}\n${formatObject(item, indent + 1)}`;
        }
        return `${pad}  • ${formatValue(item, indent + 1)}`;
      })
      .join('\n');
  }
  if (typeof value === 'object') {
    return formatObject(value, indent + 1);
  }
  return String(value);
}

/**
 * Format an object as labeled key-value pairs.
 */
function formatObject(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  const entries = Object.entries(obj);

  return entries
    .map(([key, value]) => {
      const label = colorize(BOLD, formatLabel(key) + ':');

      // Short scalar values on the same line
      if (typeof value !== 'object' || value === null) {
        const isMultiline = typeof value === 'string' && value.includes('\n');
        if (isMultiline) {
          const indented = formatValue(value, indent)
            .split('\n')
            .map((l) => pad + '  ' + l)
            .join('\n');
          return `${pad}${label}\n${indented}`;
        }
        return `${pad}${label} ${formatValue(value, indent)}`;
      }

      // Objects and arrays on the next line
      return `${pad}${label}\n${formatValue(value, indent)}`;
    })
    .join('\n\n');
}

/**
 * Render an API response object as human-readable terminal output.
 */
export function prettyPrint(data) {
  if (typeof data !== 'object' || data === null) {
    return formatValue(data);
  }
  return formatObject(data);
}
