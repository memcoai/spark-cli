import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeVersion,
  tagSchema,
  xmlTagSchema,
  feedbackOptionsSchema,
  queryInputSchema,
  insightsInputSchema,
  shareInputSchema,
  shareTaskInputSchema,
  tokenResponseSchema,
  protectedResourceSchema,
  authorizationServerSchema,
  clientRegistrationResponseSchema,
  credentialSchema,
  initDataSchema,
  versionCacheSchema,
  compatibilityCacheSchema,
  settingsSchema,
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
  it('parses valid XML tag with type and name', () => {
    assert.strictEqual(
      xmlTagSchema.parse('<tag type="language" name="python" />'),
      '<tag type="language" name="python" />',
    );
  });

  it('parses valid XML tag with version', () => {
    assert.strictEqual(
      xmlTagSchema.parse('<tag type="language" name="python" version="3.11" />'),
      '<tag type="language" name="python" version="3.11" />',
    );
  });

  it('normalizes attribute order', () => {
    assert.strictEqual(
      xmlTagSchema.parse('<tag name="python" type="language" />'),
      '<tag type="language" name="python" />',
    );
  });

  it('returns undefined for empty string', () => {
    assert.strictEqual(xmlTagSchema.parse(''), undefined);
  });

  it('fails on missing type', () => {
    const result = xmlTagSchema.safeParse('<tag name="python" />');
    assert.strictEqual(result.success, false);
    assert.match(result.error.issues[0].message, /missing required "type"/);
  });

  it('fails on missing name', () => {
    const result = xmlTagSchema.safeParse('<tag type="language" />');
    assert.strictEqual(result.success, false);
    assert.match(result.error.issues[0].message, /missing required "name"/);
  });

  it('fails on unknown attribute', () => {
    const result = xmlTagSchema.safeParse('<tag type="l" name="p" extra="x" />');
    assert.strictEqual(result.success, false);
    assert.match(result.error.issues[0].message, /unknown attribute/);
  });

  it('fails on duplicate attribute', () => {
    const result = xmlTagSchema.safeParse('<tag type="l" type="m" name="p" />');
    assert.strictEqual(result.success, false);
    assert.match(result.error.issues[0].message, /duplicate attribute/);
  });

  it('fails on invalid format', () => {
    const result = xmlTagSchema.safeParse('not xml');
    assert.strictEqual(result.success, false);
    assert.match(result.error.issues[0].message, /Invalid XML tag/);
  });
});

describe('feedbackOptionsSchema', () => {
  it('accepts helpful=true', () => {
    const result = feedbackOptionsSchema.safeParse({ helpful: true });
    assert.strictEqual(result.success, true);
  });

  it('accepts notHelpful=true', () => {
    const result = feedbackOptionsSchema.safeParse({ notHelpful: true });
    assert.strictEqual(result.success, true);
  });

  it('rejects when neither is set', () => {
    const result = feedbackOptionsSchema.safeParse({});
    assert.strictEqual(result.success, false);
    assert.match(result.error.issues[0].message, /--helpful.*--not-helpful/);
  });
});

describe('tokenResponseSchema', () => {
  it('normalizes snake_case fields', () => {
    const result = tokenResponseSchema.parse({
      access_token: 'tok123',
      refresh_token: 'ref456',
      expires_in: 3600,
    });
    assert.strictEqual(result.accessToken, 'tok123');
    assert.strictEqual(result.refreshToken, 'ref456');
    assert.strictEqual(result.expiresIn, 3600);
    assert.strictEqual(result.tokenType, 'Bearer');
  });

  it('accepts camelCase fields', () => {
    const result = tokenResponseSchema.parse({
      accessToken: 'tok123',
      refreshToken: 'ref456',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });
    assert.strictEqual(result.accessToken, 'tok123');
  });

  it('prefers camelCase over snake_case', () => {
    const result = tokenResponseSchema.parse({
      accessToken: 'camel',
      access_token: 'snake',
    });
    assert.strictEqual(result.accessToken, 'camel');
  });

  it('defaults tokenType to Bearer', () => {
    const result = tokenResponseSchema.parse({ access_token: 'tok' });
    assert.strictEqual(result.tokenType, 'Bearer');
  });

  it('fails when accessToken is missing', () => {
    const result = tokenResponseSchema.safeParse({});
    assert.strictEqual(result.success, false);
  });
});

describe('protectedResourceSchema', () => {
  it('accepts valid metadata', () => {
    const result = protectedResourceSchema.parse({
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
    });
    assert.deepStrictEqual(result.authorization_servers, ['https://auth.example.com']);
  });

  it('accepts empty object', () => {
    const result = protectedResourceSchema.parse({});
    assert.strictEqual(result.authorization_servers, undefined);
  });

  it('preserves extra fields', () => {
    const result = protectedResourceSchema.parse({ extra: 'field' });
    assert.strictEqual(result.extra, 'field');
  });
});

describe('authorizationServerSchema', () => {
  it('normalizes snake_case to camelCase', () => {
    const result = authorizationServerSchema.parse({
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      registration_endpoint: 'https://auth.example.com/register',
      bearer_methods_supported: ['header'],
    });
    assert.strictEqual(result.authorizationEndpoint, 'https://auth.example.com/authorize');
    assert.strictEqual(result.tokenEndpoint, 'https://auth.example.com/token');
    assert.strictEqual(result.registrationEndpoint, 'https://auth.example.com/register');
    assert.deepStrictEqual(result.bearerMethodsSupported, ['header']);
  });

  it('accepts camelCase endpoints', () => {
    const result = authorizationServerSchema.parse({
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
    });
    assert.strictEqual(result.authorizationEndpoint, 'https://auth.example.com/authorize');
  });

  it('fails when authorization_endpoint is missing', () => {
    const result = authorizationServerSchema.safeParse({
      token_endpoint: 'https://auth.example.com/token',
    });
    assert.strictEqual(result.success, false);
  });

  it('fails when token_endpoint is missing', () => {
    const result = authorizationServerSchema.safeParse({
      authorization_endpoint: 'https://auth.example.com/authorize',
    });
    assert.strictEqual(result.success, false);
  });
});

describe('clientRegistrationResponseSchema', () => {
  it('accepts valid response', () => {
    const result = clientRegistrationResponseSchema.parse({ client_id: 'abc123' });
    assert.strictEqual(result.client_id, 'abc123');
  });

  it('preserves extra fields', () => {
    const result = clientRegistrationResponseSchema.parse({
      client_id: 'abc',
      client_secret: 'secret',
    });
    assert.strictEqual(result.client_secret, 'secret');
  });

  it('fails when client_id is missing', () => {
    const result = clientRegistrationResponseSchema.safeParse({});
    assert.strictEqual(result.success, false);
  });
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

describe('queryInputSchema', () => {
  it('accepts a non-empty query', () => {
    const result = queryInputSchema.parse({ query: 'how to fix bug' });
    assert.strictEqual(result.query, 'how to fix bug');
  });

  it('fails on empty query', () => {
    const result = queryInputSchema.safeParse({ query: '' });
    assert.strictEqual(result.success, false);
  });

  it('fails on missing query', () => {
    const result = queryInputSchema.safeParse({});
    assert.strictEqual(result.success, false);
  });
});

describe('insightsInputSchema', () => {
  it('accepts string sessionId and string taskIndex', () => {
    const result = insightsInputSchema.parse({ sessionId: 'sess-1', taskIndex: '2' });
    assert.strictEqual(result.sessionId, 'sess-1');
    assert.strictEqual(result.taskIndex, '2');
  });

  it('coerces numeric taskIndex to string', () => {
    const result = insightsInputSchema.parse({ sessionId: 'sess-1', taskIndex: 3 });
    assert.strictEqual(result.taskIndex, '3');
  });

  it('fails on empty sessionId', () => {
    const result = insightsInputSchema.safeParse({ sessionId: '', taskIndex: '1' });
    assert.strictEqual(result.success, false);
  });
});

describe('shareInputSchema', () => {
  it('accepts valid share input', () => {
    const result = shareInputSchema.parse({
      sessionId: 'sess-1',
      title: 'My Title',
      content: 'My Content',
    });
    assert.strictEqual(result.sessionId, 'sess-1');
    assert.strictEqual(result.title, 'My Title');
    assert.strictEqual(result.content, 'My Content');
    assert.strictEqual(result.taskIndex, undefined);
    assert.strictEqual(result.sources, undefined);
  });

  it('accepts optional taskIndex and sources', () => {
    const result = shareInputSchema.parse({
      sessionId: 'sess-1',
      title: 'T',
      content: 'C',
      taskIndex: 'new',
      sources: 'a,b,c',
    });
    assert.strictEqual(result.taskIndex, 'new');
    assert.strictEqual(result.sources, 'a,b,c');
  });

  it('fails on empty title', () => {
    const result = shareInputSchema.safeParse({
      sessionId: 'sess-1',
      title: '',
      content: 'C',
    });
    assert.strictEqual(result.success, false);
  });

  it('fails on empty content', () => {
    const result = shareInputSchema.safeParse({
      sessionId: 'sess-1',
      title: 'T',
      content: '',
    });
    assert.strictEqual(result.success, false);
  });
});

describe('shareTaskInputSchema', () => {
  it('accepts query and single insight string', () => {
    const result = shareTaskInputSchema.parse({ query: 'q', insight: 'fix it' });
    assert.strictEqual(result.query, 'q');
    assert.strictEqual(result.insight, 'fix it');
  });

  it('accepts query and insight array', () => {
    const result = shareTaskInputSchema.parse({ query: 'q', insight: ['a', 'b'] });
    assert.deepStrictEqual(result.insight, ['a', 'b']);
  });

  it('fails on empty query', () => {
    const result = shareTaskInputSchema.safeParse({ query: '', insight: 'x' });
    assert.strictEqual(result.success, false);
  });

  it('fails on empty insight array', () => {
    const result = shareTaskInputSchema.safeParse({ query: 'q', insight: [] });
    assert.strictEqual(result.success, false);
  });
});
