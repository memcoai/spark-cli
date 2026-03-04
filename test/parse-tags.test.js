import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTags, tagsToXml, parseSources } from '../src/parse-tags.js';

describe('parseTags', () => {
  describe('empty input', () => {
    it('returns [] for null', () => {
      assert.deepStrictEqual(parseTags(null), []);
    });

    it('returns [] for undefined', () => {
      assert.deepStrictEqual(parseTags(undefined), []);
    });

    it('returns [] for empty array', () => {
      assert.deepStrictEqual(parseTags([]), []);
    });
  });

  describe('single string input', () => {
    it('wraps single string into array and parses', () => {
      assert.deepStrictEqual(parseTags('task_type:bug_fix'), ['task_type:bug_fix']);
    });

    it('trims whitespace', () => {
      assert.deepStrictEqual(parseTags(' task_type:bug_fix '), ['task_type:bug_fix']);
    });
  });

  describe('array input (repeated --tag)', () => {
    it('parses array of TYPE:NAME tags', () => {
      assert.deepStrictEqual(parseTags(['task_type:bug_fix', 'domain:web']), [
        'task_type:bug_fix',
        'domain:web',
      ]);
    });

    it('parses array with versioned tags', () => {
      assert.deepStrictEqual(parseTags(['language:python:3.11', 'task_type:bug_fix']), [
        'language:python:3.11',
        'task_type:bug_fix',
      ]);
    });

    it('throws on invalid tag in array', () => {
      assert.throws(() => parseTags(['task_type:bug_fix', 'invalid']), {
        message: /Invalid tag "invalid"/,
      });
    });
  });

  describe('TYPE:NAME:VERSION format', () => {
    it('parses tag with valid semver', () => {
      assert.deepStrictEqual(parseTags('language:node:1.2.3'), ['language:node:1.2.3']);
    });

    it('strips v prefix from version', () => {
      assert.deepStrictEqual(parseTags('language:node:v1.2.3'), ['language:node:1.2.3']);
    });

    it('allows pre-release suffix in patch', () => {
      assert.deepStrictEqual(parseTags('library:react:18.2.0-beta'), ['library:react:18.2.0-beta']);
    });

    it('allows pre-release identifiers with dots', () => {
      assert.deepStrictEqual(parseTags('framework:next:14.0.0-rc.1'), [
        'framework:next:14.0.0-rc.1',
      ]);
    });

    it('accepts major-only version', () => {
      assert.deepStrictEqual(parseTags('language:node:22'), ['language:node:22']);
    });

    it('accepts major-only version with v prefix', () => {
      assert.deepStrictEqual(parseTags('language:node:v22'), ['language:node:22']);
    });

    it('accepts major.minor version', () => {
      assert.deepStrictEqual(parseTags('language:node:22.11'), ['language:node:22.11']);
    });

    it('accepts major.minor version with v prefix', () => {
      assert.deepStrictEqual(parseTags('language:node:v22.11'), ['language:node:22.11']);
    });
  });

  describe('validation errors', () => {
    it('throws on bare string without colon', () => {
      assert.throws(() => parseTags('react'), {
        message: /Invalid tag "react": expected TYPE:NAME/,
      });
    });

    it('throws on empty type', () => {
      assert.throws(() => parseTags(':name'), {
        message: /Invalid tag ":name": expected TYPE:NAME/,
      });
    });

    it('throws on empty name', () => {
      assert.throws(() => parseTags('type:'), {
        message: /Invalid tag "type:": expected TYPE:NAME/,
      });
    });

    it('throws on too many colon-separated parts', () => {
      assert.throws(() => parseTags('a:b:c:d'), {
        message: /Invalid tag "a:b:c:d": expected TYPE:NAME/,
      });
    });

    it('throws on non-numeric version', () => {
      assert.throws(() => parseTags('language:node:latest'), {
        message: /Invalid version "latest".*expected a numeric version/,
      });
    });

    it('throws on non-integer major', () => {
      assert.throws(() => parseTags('language:node:abc.0.0'), {
        message: /Invalid version "abc.0.0"/,
      });
    });

    it('throws on non-integer minor', () => {
      assert.throws(() => parseTags('language:node:1.abc.0'), {
        message: /Invalid version "1.abc.0"/,
      });
    });
  });
});

describe('tagsToXml', () => {
  it('returns [] for null', () => {
    assert.deepStrictEqual(tagsToXml(null), []);
  });

  it('returns [] for empty array', () => {
    assert.deepStrictEqual(tagsToXml([]), []);
  });

  it('converts TYPE:NAME tag to XML without version', () => {
    assert.deepStrictEqual(tagsToXml(['task_type:bug_fix']), [
      '<tag type="task_type" name="bug_fix" />',
    ]);
  });

  it('converts TYPE:NAME:VERSION tag to XML with version', () => {
    assert.deepStrictEqual(tagsToXml(['language:python:3.11']), [
      '<tag type="language" name="python" version="3.11" />',
    ]);
  });

  it('converts multiple mixed tags', () => {
    assert.deepStrictEqual(
      tagsToXml(['language:python:3.11', 'task_type:bug_fix', 'framework:django:4.2']),
      [
        '<tag type="language" name="python" version="3.11" />',
        '<tag type="task_type" name="bug_fix" />',
        '<tag type="framework" name="django" version="4.2" />',
      ],
    );
  });

  it('handles pre-release version', () => {
    assert.deepStrictEqual(tagsToXml(['library:react:18.2.0-beta']), [
      '<tag type="library" name="react" version="18.2.0-beta" />',
    ]);
  });

  it('escapes XML special characters in attributes', () => {
    assert.deepStrictEqual(tagsToXml(['type&<>:name"\'test']), [
      '<tag type="type&amp;&lt;&gt;" name="name&quot;&apos;test" />',
    ]);
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
    assert.deepStrictEqual(parseSources('DOC-1,INSIGHT-2'), ['DOC-1', 'INSIGHT-2']);
  });

  it('trims whitespace', () => {
    assert.deepStrictEqual(parseSources(' DOC-1 , INSIGHT-2 '), ['DOC-1', 'INSIGHT-2']);
  });

  it('filters empty strings from trailing commas', () => {
    assert.deepStrictEqual(parseSources('DOC-1,'), ['DOC-1']);
  });
});
