import { colorize } from './banner.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

/**
 * Render a markdown string as ANSI-formatted terminal text.
 * Handles headings, bold, italic, inline code, fenced code blocks,
 * lists, horizontal rules, links, and linebreaks.
 */
export function formatMarkdown(text) {
  if (!text) return '';

  const lines = text.split('\n');
  const result = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // Toggle fenced code block state
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(colorize(DIM, '─'.repeat(40)));
      continue;
    }

    // Inside code block: dim + indented, no inline formatting
    if (inCodeBlock) {
      result.push(colorize(DIM, '  ' + line));
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      result.push('', colorize(BOLD + YELLOW, headingMatch[2]));
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      const width = process.stdout.columns || 72;
      result.push(colorize(DIM, '─'.repeat(Math.min(width, 72))));
      continue;
    }

    // Unordered list items
    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)/);
    if (ulMatch) {
      const indent = ulMatch[1];
      const content = applyInlineFormatting(ulMatch[2]);
      result.push(`${indent}  • ${content}`);
      continue;
    }

    // Ordered list items
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (olMatch) {
      const indent = olMatch[1];
      const num = olMatch[2];
      const content = applyInlineFormatting(olMatch[3]);
      result.push(`${indent}  ${num}. ${content}`);
      continue;
    }

    // Regular line: apply inline formatting
    result.push(applyInlineFormatting(line));
  }

  return result.join('\n');
}

/**
 * Apply inline markdown formatting (bold, italic, code, links).
 */
function applyInlineFormatting(line) {
  let formatted = line;

  // Bold: **text**
  formatted = formatted.replaceAll(/\*\*(.+?)\*\*/g, (_, t) => colorize(BOLD, t));

  // Italic: *text* (not preceded/followed by *)
  formatted = formatted.replaceAll(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (_, t) => colorize(ITALIC, t));

  // Italic: _text_ (not preceded/followed by _)
  formatted = formatted.replaceAll(/(?<!_)_([^_]+?)_(?!_)/g, (_, t) => colorize(ITALIC, t));

  // Inline code: `code`
  formatted = formatted.replaceAll(/`([^`]+)`/g, (_, t) => colorize(DIM, t));

  // Links: [text](url)
  formatted = formatted.replaceAll(
    /\[([^\]]+)]\(([^)]+)\)/g,
    (_, text, url) => `${text} (${colorize(CYAN, url)})`,
  );

  return formatted;
}
