import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatMarkdown } from '../src/format-markdown.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const CYAN = '\x1b[36m';

function assertIncludes(result, ...substrings) {
  for (const s of substrings) {
    assert.ok(result.includes(s), `expected result to include ${JSON.stringify(s)}`);
  }
}

function assertExcludes(result, ...substrings) {
  for (const s of substrings) {
    assert.ok(!result.includes(s), `expected result not to include ${JSON.stringify(s)}`);
  }
}

describe('formatMarkdown', () => {
  it('returns empty string for empty input', () => {
    assert.strictEqual(formatMarkdown(''), '');
    assert.strictEqual(formatMarkdown(null), '');
    assert.strictEqual(formatMarkdown(undefined), '');
  });

  it('passes plain text through unchanged', () => {
    assert.strictEqual(formatMarkdown('hello world'), 'hello world');
  });

  it('preserves linebreaks', () => {
    const result = formatMarkdown('line one\nline two\nline three');
    assertIncludes(result, 'line one', 'line two', 'line three');
    assert.strictEqual(result.split('\n').length, 3);
  });

  describe('headings', () => {
    const headingCases = [
      ['h1', '# My Heading', 'My Heading', [BOLD]],
      ['h2', '## Sub Heading', 'Sub Heading', [BOLD]],
      ['h3', '### Deep Heading', 'Deep Heading', []],
    ];

    for (const [level, input, text, codes] of headingCases) {
      it(`formats ${level} headings`, () => {
        const result = formatMarkdown(input);
        assertIncludes(result, text, ...codes);
      });
    }

    it('adds blank line before heading', () => {
      assert.ok(formatMarkdown('# Title').startsWith('\n'));
    });
  });

  describe('inline formatting', () => {
    const inlineCases = [
      ['bold', 'some **bold** text', ['bold', BOLD], ['**']],
      ['italic with asterisks', 'some *italic* text', ['italic', ITALIC], []],
      ['italic with underscores', 'some _italic_ text', ['italic', ITALIC], []],
      ['inline code', 'use `npm install` here', ['npm install', DIM], ['`']],
    ];

    for (const [label, input, includes, excludes] of inlineCases) {
      it(`formats ${label}`, () => {
        const result = formatMarkdown(input);
        assertIncludes(result, ...includes);
        assertExcludes(result, ...excludes);
      });
    }

    it('formats links', () => {
      const result = formatMarkdown('visit [Spark](https://spark.memco.ai)');
      assertIncludes(result, 'Spark', 'https://spark.memco.ai', CYAN);
      assertExcludes(result, '](');
    });
  });

  describe('code blocks', () => {
    it('formats fenced code blocks with dim styling', () => {
      const result = formatMarkdown('```\nconst x = 1;\nconsole.log(x);\n```');
      assertIncludes(result, DIM, 'const x = 1;');
    });

    it('indents code block content', () => {
      const result = formatMarkdown('```\ncode here\n```');
      assertIncludes(result, '  code here');
    });

    it('does not apply inline formatting inside code blocks', () => {
      const result = formatMarkdown('```\nsome **not bold** text\n```');
      assertIncludes(result, '**not bold**');
    });

    it('handles code blocks with language specifier', () => {
      const result = formatMarkdown('```javascript\nconst x = 1;\n```');
      assertIncludes(result, 'const x = 1;');
    });
  });

  describe('lists', () => {
    it('formats unordered list with dash', () => {
      const result = formatMarkdown('- first item\n- second item');
      assertIncludes(result, '•', 'first item', 'second item');
    });

    it('formats unordered list with asterisk', () => {
      const result = formatMarkdown('* first item\n* second item');
      assertIncludes(result, '•', 'first item');
    });

    it('formats ordered list', () => {
      const result = formatMarkdown('1. first\n2. second');
      assertIncludes(result, '1.', 'first', '2.', 'second');
    });

    it('applies inline formatting within list items', () => {
      const result = formatMarkdown('- some **bold** item');
      assertIncludes(result, '•', BOLD);
    });
  });

  describe('horizontal rules', () => {
    for (const [label, input] of [['dash', '---'], ['asterisk', '***']]) {
      it(`renders ${label} horizontal rules`, () => {
        assertIncludes(formatMarkdown(input), '─');
      });
    }
  });

  describe('NO_COLOR', () => {
    let originalNoColor;

    beforeEach(() => {
      originalNoColor = process.env.NO_COLOR;
      process.env.NO_COLOR = '1';
    });

    afterEach(() => {
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    });

    it('strips ANSI codes when NO_COLOR is set', () => {
      const result = formatMarkdown('# Heading\n**bold**');
      assertExcludes(result, '\x1b[');
      assertIncludes(result, 'Heading', 'bold');
    });
  });
});