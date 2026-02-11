import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatMarkdown } from '../src/format-markdown.js';

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
    const input = 'line one\nline two\nline three';
    const result = formatMarkdown(input);
    assert.ok(result.includes('line one'));
    assert.ok(result.includes('line two'));
    assert.ok(result.includes('line three'));
    assert.strictEqual(result.split('\n').length, 3);
  });

  describe('headings', () => {
    it('formats h1 headings with bold and color', () => {
      const result = formatMarkdown('# My Heading');
      assert.ok(result.includes('My Heading'));
      assert.ok(result.includes('\x1b[1m'));
    });

    it('formats h2 headings', () => {
      const result = formatMarkdown('## Sub Heading');
      assert.ok(result.includes('Sub Heading'));
      assert.ok(result.includes('\x1b[1m'));
    });

    it('formats h3 headings', () => {
      const result = formatMarkdown('### Deep Heading');
      assert.ok(result.includes('Deep Heading'));
    });

    it('adds blank line before heading', () => {
      const result = formatMarkdown('# Title');
      assert.ok(result.startsWith('\n'));
    });
  });

  describe('inline formatting', () => {
    it('formats bold text', () => {
      const result = formatMarkdown('some **bold** text');
      assert.ok(result.includes('\x1b[1m'));
      assert.ok(result.includes('bold'));
      assert.ok(!result.includes('**'));
    });

    it('formats italic text with asterisks', () => {
      const result = formatMarkdown('some *italic* text');
      assert.ok(result.includes('\x1b[3m'));
      assert.ok(result.includes('italic'));
    });

    it('formats italic text with underscores', () => {
      const result = formatMarkdown('some _italic_ text');
      assert.ok(result.includes('\x1b[3m'));
      assert.ok(result.includes('italic'));
    });

    it('formats inline code', () => {
      const result = formatMarkdown('use `npm install` here');
      assert.ok(result.includes('\x1b[2m'));
      assert.ok(result.includes('npm install'));
      assert.ok(!result.includes('`'));
    });

    it('formats links', () => {
      const result = formatMarkdown('visit [Spark](https://spark.memco.ai)');
      assert.ok(result.includes('Spark'));
      assert.ok(result.includes('https://spark.memco.ai'));
      assert.ok(result.includes('\x1b[36m'));
      // Markdown link syntax should be removed
      assert.ok(!result.includes(']('));
    });
  });

  describe('code blocks', () => {
    it('formats fenced code blocks with dim styling', () => {
      const input = '```\nconst x = 1;\nconsole.log(x);\n```';
      const result = formatMarkdown(input);
      assert.ok(result.includes('\x1b[2m'));
      assert.ok(result.includes('const x = 1;'));
    });

    it('indents code block content', () => {
      const input = '```\ncode here\n```';
      const result = formatMarkdown(input);
      assert.ok(result.includes('  code here'));
    });

    it('does not apply inline formatting inside code blocks', () => {
      const input = '```\nsome **not bold** text\n```';
      const result = formatMarkdown(input);
      assert.ok(result.includes('**not bold**'));
    });

    it('handles code blocks with language specifier', () => {
      const input = '```javascript\nconst x = 1;\n```';
      const result = formatMarkdown(input);
      assert.ok(result.includes('const x = 1;'));
    });
  });

  describe('lists', () => {
    it('formats unordered list with dash', () => {
      const result = formatMarkdown('- first item\n- second item');
      assert.ok(result.includes('•'));
      assert.ok(result.includes('first item'));
      assert.ok(result.includes('second item'));
    });

    it('formats unordered list with asterisk', () => {
      const result = formatMarkdown('* first item\n* second item');
      assert.ok(result.includes('•'));
      assert.ok(result.includes('first item'));
    });

    it('formats ordered list', () => {
      const result = formatMarkdown('1. first\n2. second');
      assert.ok(result.includes('1.'));
      assert.ok(result.includes('first'));
      assert.ok(result.includes('2.'));
      assert.ok(result.includes('second'));
    });

    it('applies inline formatting within list items', () => {
      const result = formatMarkdown('- some **bold** item');
      assert.ok(result.includes('•'));
      assert.ok(result.includes('\x1b[1m'));
    });
  });

  describe('horizontal rules', () => {
    it('renders dash horizontal rules', () => {
      const result = formatMarkdown('---');
      assert.ok(result.includes('─'));
    });

    it('renders asterisk horizontal rules', () => {
      const result = formatMarkdown('***');
      assert.ok(result.includes('─'));
    });
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
      assert.ok(!result.includes('\x1b['));
      assert.ok(result.includes('Heading'));
      assert.ok(result.includes('bold'));
    });
  });
});
