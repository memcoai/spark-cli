import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTags, parseSources } from '../src/parse-tags.js';

describe('parseTags', () => {
  describe('empty input', () => {
    it('returns [] for null', () => {
      assert.deepStrictEqual(parseTags(null), []);
    });

    it('returns [] for undefined', () => {
      assert.deepStrictEqual(parseTags(undefined), []);
    });

    it('returns [] for empty string', () => {
      assert.deepStrictEqual(parseTags(''), []);
    });
  });

  describe('TYPE:NAME format', () => {
    it('parses a single tag', () => {
      assert.deepStrictEqual(parseTags('task_type:bug_fix'), ['task_type:bug_fix']);
    });

    it('parses multiple comma-separated tags', () => {
      assert.deepStrictEqual(
        parseTags('task_type:bug_fix,domain:web'),
        ['task_type:bug_fix', 'domain:web']
      );
    });

    it('trims whitespace around tags', () => {
      assert.deepStrictEqual(
        parseTags(' task_type:bug_fix , domain:web '),
        ['task_type:bug_fix', 'domain:web']
      );
    });

    it('skips empty segments from trailing commas', () => {
      assert.deepStrictEqual(
        parseTags('task_type:bug_fix,'),
        ['task_type:bug_fix']
      );
    });
  });

  describe('TYPE:NAME:VERSION format', () => {
    it('parses tag with valid semver', () => {
      assert.deepStrictEqual(
        parseTags('language_version:node:1.2.3'),
        ['language_version:node:1.2.3']
      );
    });

    it('strips v prefix from version', () => {
      assert.deepStrictEqual(
        parseTags('language_version:node:v1.2.3'),
        ['language_version:node:1.2.3']
      );
    });

    it('allows pre-release suffix in patch', () => {
      assert.deepStrictEqual(
        parseTags('library_version:react:18.2.0-beta'),
        ['library_version:react:18.2.0-beta']
      );
    });

    it('allows pre-release identifiers with dots', () => {
      assert.deepStrictEqual(
        parseTags('framework_version:next:14.0.0-rc.1'),
        ['framework_version:next:14.0.0-rc.1']
      );
    });

    it('accepts major-only version', () => {
      assert.deepStrictEqual(
        parseTags('language_version:node:22'),
        ['language_version:node:22']
      );
    });

    it('accepts major-only version with v prefix', () => {
      assert.deepStrictEqual(
        parseTags('language_version:node:v22'),
        ['language_version:node:22']
      );
    });

    it('accepts major.minor version', () => {
      assert.deepStrictEqual(
        parseTags('language_version:node:22.11'),
        ['language_version:node:22.11']
      );
    });

    it('accepts major.minor version with v prefix', () => {
      assert.deepStrictEqual(
        parseTags('language_version:node:v22.11'),
        ['language_version:node:22.11']
      );
    });

    it('mixes TYPE:NAME and TYPE:NAME:VERSION tags', () => {
      assert.deepStrictEqual(
        parseTags('task_type:bug_fix,language_version:node:20.0.0'),
        ['task_type:bug_fix', 'language_version:node:20.0.0']
      );
    });
  });

  describe('validation errors', () => {
    it('throws on bare string without colon', () => {
      assert.throws(
        () => parseTags('react'),
        { message: /Invalid tag "react": expected TYPE:NAME/ }
      );
    });

    it('throws on empty type', () => {
      assert.throws(
        () => parseTags(':name'),
        { message: /Invalid tag ":name": expected TYPE:NAME/ }
      );
    });

    it('throws on empty name', () => {
      assert.throws(
        () => parseTags('type:'),
        { message: /Invalid tag "type:": expected TYPE:NAME/ }
      );
    });

    it('throws on too many colon-separated parts', () => {
      assert.throws(
        () => parseTags('a:b:c:d'),
        { message: /Invalid tag "a:b:c:d": expected TYPE:NAME/ }
      );
    });

    it('throws on non-numeric version', () => {
      assert.throws(
        () => parseTags('language_version:node:latest'),
        { message: /Invalid version "latest".*expected a numeric version/ }
      );
    });

    it('throws on non-integer major', () => {
      assert.throws(
        () => parseTags('language_version:node:abc.0.0'),
        { message: /Invalid version "abc.0.0"/ }
      );
    });

    it('throws on non-integer minor', () => {
      assert.throws(
        () => parseTags('language_version:node:1.abc.0'),
        { message: /Invalid version "1.abc.0"/ }
      );
    });

    it('throws on first invalid tag in a list', () => {
      assert.throws(
        () => parseTags('task_type:bug_fix,invalid'),
        { message: /Invalid tag "invalid"/ }
      );
    });
  });
});

describe('parseSources', () => {
  it('returns [] for null', () => {
    assert.deepStrictEqual(parseSources(null), []);
  });

  it('returns [] for undefined', () => {
    assert.deepStrictEqual(parseSources(undefined), []);
  });

  it('returns [] for empty string', () => {
    assert.deepStrictEqual(parseSources(''), []);
  });

  it('splits comma-separated source IDs', () => {
    assert.deepStrictEqual(
      parseSources('DOC-1,INSIGHT-2'),
      ['DOC-1', 'INSIGHT-2']
    );
  });

  it('trims whitespace', () => {
    assert.deepStrictEqual(
      parseSources(' DOC-1 , INSIGHT-2 '),
      ['DOC-1', 'INSIGHT-2']
    );
  });

  it('filters empty strings from trailing commas', () => {
    assert.deepStrictEqual(
      parseSources('DOC-1,'),
      ['DOC-1']
    );
  });
});
