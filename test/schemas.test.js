import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { schemaValidationTests, missingAttrCases } from './helpers.js';
import {
  normalizeVersion,
  tagSchema,
  xmlTagSchema,
  feedbackEntrySchema,
  credentialSchema,
  settingsSchema,
  toolManifestCacheSchema,
  toolResponseSchema,
  npmVersionResponseSchema,
  compatibilityDataSchema,
} from '../src/schemas.js';

describe('normalizeVersion', () => {
  it('accepts major only', () => {
    assert.strictEqual(normalizeVersion('3'), '3');
  });

  it('accepts major.minor', () => {
    assert.strictEqual(normalizeVersion('3.11'), '3.11');
  });

  it('accepts major.minor.patch', () => {
    assert.strictEqual(normalizeVersion('3.11.0'), '3.11.0');
  });

  it('strips leading v', () => {
    assert.strictEqual(normalizeVersion('v3.11'), '3.11');
  });

  it('strips trailing .x', () => {
    assert.strictEqual(normalizeVersion('3.x'), '3');
    assert.strictEqual(normalizeVersion('3.11.x'), '3.11');
  });

  it('accepts pre-release suffix', () => {
    assert.strictEqual(normalizeVersion('3.11.0-beta'), '3.11.0-beta');
    assert.strictEqual(normalizeVersion('1.0.0-rc.1'), '1.0.0-rc.1');
  });

  it('returns null for non-numeric parts', () => {
    assert.strictEqual(normalizeVersion('abc'), null);
    assert.strictEqual(normalizeVersion('3.abc'), null);
  });

  it('returns null for too many parts', () => {
    assert.strictEqual(normalizeVersion('1.2.3.4'), null);
  });
});

describe('tagSchema', () => {
  it('parses TYPE:NAME', () => {
    assert.strictEqual(tagSchema.parse('language:python'), 'language:python');
  });

  it('parses TYPE:NAME:VERSION', () => {
    assert.strictEqual(tagSchema.parse('language:python:3.11'), 'language:python:3.11');
  });

  it('normalizes version in tag', () => {
    assert.strictEqual(tagSchema.parse('language:python:v3.11'), 'language:python:3.11');
  });

  it('returns undefined for empty string', () => {
    assert.strictEqual(tagSchema.parse(''), undefined);
    assert.strictEqual(tagSchema.parse('  '), undefined);
  });

  it('fails on invalid format', () => {
    const result = tagSchema.safeParse('invalid');
    assert.strictEqual(result.success, false);
    assert.match(result.error.issues[0].message, /Invalid tag/);
  });

  it('fails on empty type or name', () => {
    const result = tagSchema.safeParse(':name');
    assert.strictEqual(result.success, false);
  });

  it('fails on invalid version', () => {
    const result = tagSchema.safeParse('type:name:abc');
    assert.strictEqual(result.success, false);
    assert.match(result.error.issues[0].message, /Invalid version/);
  });
});

describe('xmlTagSchema', () => {
  schemaValidationTests(xmlTagSchema, [
    {
      name: 'parses valid XML tag with type and name',
      input: '<tag type="language" name="python" />',
      valid: true,
      expected: '<tag type="language" name="python" />',
    },
    {
      name: 'parses valid XML tag with version',
      input: '<tag type="language" name="python" version="3.11" />',
      valid: true,
      expected: '<tag type="language" name="python" version="3.11" />',
    },
    {
      name: 'normalizes attribute order',
      input: '<tag name="python" type="language" />',
      valid: true,
      expected: '<tag type="language" name="python" />',
    },
    {
      name: 'returns undefined for empty string',
      input: '',
      valid: true,
      expected: undefined,
    },
    ...missingAttrCases(
      'tag',
      { type: 'language', name: 'python' },
      { quoteChar: '"', selfClosing: true },
    ),
    {
      name: 'fails on unknown attribute',
      input: '<tag type="l" name="p" extra="x" />',
      valid: false,
      errorMatch: /unknown attribute/,
    },
    {
      name: 'fails on duplicate attribute',
      input: '<tag type="l" type="m" name="p" />',
      valid: false,
      errorMatch: /duplicate attribute/,
    },
    {
      name: 'fails on invalid format',
      input: 'not xml',
      valid: false,
      errorMatch: /Invalid XML tag/,
    },
    {
      name: 'rejects __proto__ attribute (prototype pollution)',
      input: '<tag __proto__="polluted" type="l" name="p" />',
      valid: false,
      errorMatch: /unknown attribute/,
    },
    {
      name: 'rejects constructor attribute (prototype pollution)',
      input: '<tag constructor="polluted" type="l" name="p" />',
      valid: false,
      errorMatch: /unknown attribute/,
    },
  ]);
});

describe('feedbackEntrySchema', () => {
  schemaValidationTests(feedbackEntrySchema, [
    {
      name: 'accepts valid feedback with comment',
      input: "<feedback idx='rec-1' relevant='true' correct='true'>great match</feedback>",
      valid: true,
      expected: "<feedback idx='rec-1' relevant='true' correct='true'>great match</feedback>",
    },
    {
      name: 'accepts valid feedback without comment',
      input: "<feedback idx='rec-2' relevant='false' correct='true'></feedback>",
      valid: true,
      expected: "<feedback idx='rec-2' relevant='false' correct='true'></feedback>",
    },
    {
      name: 'normalizes self-closing to expanded form',
      input: "<feedback idx='rec-3' relevant='true' correct='false' />",
      valid: true,
      expected: "<feedback idx='rec-3' relevant='true' correct='false'></feedback>",
    },
    {
      name: 'normalizes attribute order',
      input: "<feedback correct='true' idx='rec-4' relevant='false'>comment</feedback>",
      valid: true,
      expected: "<feedback idx='rec-4' relevant='false' correct='true'>comment</feedback>",
    },
    ...missingAttrCases('feedback', { idx: 'rec-1', relevant: 'true', correct: 'true' }),
    {
      name: 'rejects invalid relevant value',
      input: "<feedback idx='rec-1' relevant='yes' correct='true'></feedback>",
      valid: false,
      errorMatch: /"relevant" must be/,
    },
    {
      name: 'rejects unknown attributes',
      input: "<feedback idx='rec-1' relevant='true' correct='true' extra='bad'></feedback>",
      valid: false,
      errorMatch: /unknown attribute "extra"/,
    },
    {
      name: 'accepts trailing whitespace before self-closing />',
      input: "<feedback idx='rec-5' relevant='true' correct='false'   />",
      valid: true,
      expected: "<feedback idx='rec-5' relevant='true' correct='false'></feedback>",
    },
    {
      name: 'accepts trailing whitespace before > in open/close form',
      input: "<feedback idx='rec-6' relevant='false' correct='true'   >some comment</feedback>",
      valid: true,
      expected: "<feedback idx='rec-6' relevant='false' correct='true'>some comment</feedback>",
    },
    {
      name: 'rejects invalid XML format',
      input: 'not xml at all',
      valid: false,
      errorMatch: /Invalid feedback entry/,
    },
    {
      name: 'accepts double-quoted attributes with comment',
      input: '<feedback idx="doc-1" relevant="true" correct="true">This was helpful</feedback>',
      valid: true,
      expected: "<feedback idx='doc-1' relevant='true' correct='true'>This was helpful</feedback>",
    },
    {
      name: 'accepts double-quoted attributes self-closing',
      input: '<feedback idx="doc-2" relevant="false" correct="true" />',
      valid: true,
      expected: "<feedback idx='doc-2' relevant='false' correct='true'></feedback>",
    },
    {
      name: 'accepts mixed single and double-quoted attributes',
      input: `<feedback idx='doc-3' relevant="true" correct='false'>mixed</feedback>`,
      valid: true,
      expected: "<feedback idx='doc-3' relevant='true' correct='false'>mixed</feedback>",
    },
    {
      name: 'rejects invalid correct value',
      input: "<feedback idx='rec-1' relevant='true' correct='maybe'></feedback>",
      valid: false,
      errorMatch: /"correct" must be/,
    },
    {
      name: 'escapes special characters in comment content',
      input: "<feedback idx='rec-1' relevant='true' correct='true'>a & b</feedback>",
      valid: true,
      expected: "<feedback idx='rec-1' relevant='true' correct='true'>a &amp; b</feedback>",
    },
  ]);
});

describe('credentialSchema', () => {
  it('accepts OAuth credentials', () => {
    const result = credentialSchema.parse({
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: 1234567890,
      tokenType: 'Bearer',
    });
    assert.strictEqual(result.accessToken, 'tok');
  });

  it('accepts legacy API key', () => {
    const result = credentialSchema.parse({ apiKey: 'key123' });
    assert.strictEqual(result.apiKey, 'key123');
  });

  it('accepts empty object', () => {
    const result = credentialSchema.safeParse({});
    assert.strictEqual(result.success, true);
  });

  it('preserves extra fields', () => {
    const result = credentialSchema.parse({ custom: 'field' });
    assert.strictEqual(result.custom, 'field');
  });
});

describe('settingsSchema', () => {
  it('accepts valid settings', () => {
    const result = settingsSchema.safeParse({
      apiBase: 'https://spark.memco.ai',
      credentials: {
        'https://spark.memco.ai': { accessToken: 'tok' },
      },
    });
    assert.strictEqual(result.success, true);
  });

  it('accepts empty object', () => {
    const result = settingsSchema.safeParse({});
    assert.strictEqual(result.success, true);
  });

  it('preserves unknown top-level fields', () => {
    const result = settingsSchema.parse({ custom: 'value' });
    assert.strictEqual(result.custom, 'value');
  });

  it('accepts flat credentials (legacy format)', () => {
    const result = settingsSchema.safeParse({
      credentials: { accessToken: 'tok', refreshToken: 'ref' },
    });
    assert.strictEqual(result.success, true);
  });

  it('accepts a valid toolManifest', () => {
    const result = settingsSchema.safeParse({
      toolManifest: {
        tools: [{ serverName: 'search' }],
        checkedAt: 123,
        apiBase: 'https://spark.memco.ai',
      },
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.toolManifest.tools[0].serverName, 'search');
  });

  it('accepts settings with toolManifest absent', () => {
    const result = settingsSchema.safeParse({
      credentials: { 'https://spark.memco.ai': { accessToken: 'tok' } },
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.toolManifest, undefined);
  });

  it('accepts settings with toolManifest null', () => {
    const result = settingsSchema.safeParse({ toolManifest: null });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.toolManifest, null);
  });

  it('fails open on a corrupt toolManifest without poisoning the rest', () => {
    // A tool entry missing `serverName` is rejected by toolManifestCacheSchema
    // itself, but `.catch(null)` on the settings key must coerce the corrupt
    // value to null so credentials and other keys still parse.
    const result = settingsSchema.safeParse({
      credentials: { 'https://spark.memco.ai': { accessToken: 'tok' } },
      toolManifest: {
        tools: [{ description: 'no serverName' }],
        checkedAt: 123,
        apiBase: 'https://spark.memco.ai',
      },
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.toolManifest, null);
    // Unrelated keys are preserved — a bad manifest does not poison the parse.
    assert.strictEqual(result.data.credentials['https://spark.memco.ai'].accessToken, 'tok');
  });

  it('fails open when toolManifest is the wrong type entirely', () => {
    const result = settingsSchema.safeParse({
      credentials: { 'https://spark.memco.ai': { accessToken: 'tok' } },
      toolManifest: 'not an object',
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.toolManifest, null);
    assert.strictEqual(result.data.credentials['https://spark.memco.ai'].accessToken, 'tok');
  });
});

describe('toolManifestCacheSchema', () => {
  it('accepts a valid manifest with a verbatim serverName (no name field)', () => {
    const result = toolManifestCacheSchema.safeParse({
      tools: [{ serverName: 'search' }],
      checkedAt: 1700000000000,
      apiBase: 'https://spark.memco.ai',
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.tools[0].serverName, 'search');
    assert.ok(!('name' in result.data.tools[0]), 'no name field is required or retained');
  });

  it('accepts optional description, inputSchema, and outputSchema', () => {
    const result = toolManifestCacheSchema.safeParse({
      tools: [
        {
          serverName: 'search',
          description: 'Search the knowledge network',
          inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
          outputSchema: { type: 'object' },
        },
      ],
      checkedAt: 1700000000000,
      apiBase: 'https://spark.memco.ai',
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.tools[0].description, 'Search the knowledge network');
    assert.strictEqual(result.data.tools[0].inputSchema.type, 'object');
  });

  it('accepts an empty tools array', () => {
    const result = toolManifestCacheSchema.safeParse({
      tools: [],
      checkedAt: 1700000000000,
      apiBase: 'https://spark.memco.ai',
    });
    assert.strictEqual(result.success, true);
  });

  it('tolerates extra fields via looseObject', () => {
    const result = toolManifestCacheSchema.parse({
      tools: [{ serverName: 'search', extraTool: 'x' }],
      checkedAt: 1700000000000,
      apiBase: 'https://spark.memco.ai',
      extraTop: 'y',
    });
    assert.strictEqual(result.extraTop, 'y');
    assert.strictEqual(result.tools[0].extraTool, 'x');
  });

  it('rejects a tool missing serverName', () => {
    const result = toolManifestCacheSchema.safeParse({
      tools: [{ description: 'x' }],
      checkedAt: 1700000000000,
      apiBase: 'https://spark.memco.ai',
    });
    assert.strictEqual(result.success, false);
  });

  it('rejects a tool with empty serverName', () => {
    const result = toolManifestCacheSchema.safeParse({
      tools: [{ serverName: '' }],
      checkedAt: 1700000000000,
      apiBase: 'https://spark.memco.ai',
    });
    assert.strictEqual(result.success, false);
  });

  it('rejects a manifest missing checkedAt', () => {
    const result = toolManifestCacheSchema.safeParse({
      tools: [{ serverName: 'search' }],
      apiBase: 'https://spark.memco.ai',
    });
    assert.strictEqual(result.success, false);
  });

  it('rejects a manifest missing apiBase', () => {
    const result = toolManifestCacheSchema.safeParse({
      tools: [{ serverName: 'search' }],
      checkedAt: 1700000000000,
    });
    assert.strictEqual(result.success, false);
  });
});

describe('toolResponseSchema', () => {
  it('accepts any object', () => {
    const result = toolResponseSchema.parse({ data: [1, 2, 3], meta: 'info' });
    assert.deepStrictEqual(result.data, [1, 2, 3]);
  });
});

describe('npmVersionResponseSchema', () => {
  it('accepts valid version response', () => {
    const result = npmVersionResponseSchema.parse({ version: '1.2.3' });
    assert.strictEqual(result.version, '1.2.3');
  });

  it('fails when version is missing', () => {
    const result = npmVersionResponseSchema.safeParse({});
    assert.strictEqual(result.success, false);
  });

  it('fails when version is empty', () => {
    const result = npmVersionResponseSchema.safeParse({ version: '' });
    assert.strictEqual(result.success, false);
  });
});

describe('compatibilityDataSchema', () => {
  it('accepts full response', () => {
    const result = compatibilityDataSchema.parse({
      minimum_version: '0.2.0',
      deprecations: [{ version_below: '0.3.0', message: 'Please upgrade' }],
      message: 'Global message',
    });
    assert.strictEqual(result.minimum_version, '0.2.0');
    assert.strictEqual(result.deprecations.length, 1);
  });

  it('accepts empty object', () => {
    const result = compatibilityDataSchema.safeParse({});
    assert.strictEqual(result.success, true);
  });

  it('preserves extra fields', () => {
    const result = compatibilityDataSchema.parse({ extra: 'data' });
    assert.strictEqual(result.extra, 'data');
  });
});
