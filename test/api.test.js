import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { apiRequest } from '../src/api.js';
import { mockFetchSequence, buildApiRequestDeps } from './helpers.js';

const BASE = 'https://spark.memco.ai';

describe('apiRequest 401 retry with token refresh', () => {
  it('retries with refreshed token on 401', async () => {
    const doFetch = mockFetchSequence([{ status: 401 }, { status: 200, json: { ok: true } }]);
    const deps = buildApiRequestDeps({ doFetch });

    const result = await apiRequest('/api/test', BASE, 'GET', null, null, deps);

    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(doFetch.calls.length, 2);
    assert.match(doFetch.calls[1].options.headers['Authorization'], /Bearer new-token/);
  });

  it('throws session expired when refresh fails on 401', async () => {
    const doFetch = mockFetchSequence([{ status: 401 }]);
    const deps = buildApiRequestDeps({
      doFetch,
      refresh: async () => {
        throw new Error('refresh failed');
      },
    });

    await assert.rejects(() => apiRequest('/api/test', BASE, 'GET', null, null, deps), {
      message: /Session expired/,
    });
  });

  it('does not retry 401 for API key auth', async () => {
    const doFetch = mockFetchSequence([{ status: 401, text: 'Unauthorized' }]);
    const deps = buildApiRequestDeps({
      doFetch,
      getAuth: async () => ({ type: 'apiKey', token: 'key-123' }),
    });

    await assert.rejects(() => apiRequest('/api/test', BASE, 'GET', null, null, deps), {
      message: /API error \(401\)/,
    });
    assert.strictEqual(doFetch.calls.length, 1);
  });

  it('throws on retry failure after successful refresh', async () => {
    const doFetch = mockFetchSequence([{ status: 401 }, { status: 403, text: 'Forbidden' }]);
    const deps = buildApiRequestDeps({ doFetch });

    await assert.rejects(() => apiRequest('/api/test', BASE, 'GET', null, null, deps), {
      message: /API error \(403\): Forbidden/,
    });
    assert.strictEqual(doFetch.calls.length, 2);
  });

  it('does not retry non-401 errors', async () => {
    const doFetch = mockFetchSequence([{ status: 500, text: 'Server Error' }]);
    const deps = buildApiRequestDeps({ doFetch });

    await assert.rejects(() => apiRequest('/api/test', BASE, 'GET', null, null, deps), {
      message: /API error \(500\)/,
    });
    assert.strictEqual(doFetch.calls.length, 1);
  });

  it('rebuilds URL with refreshed token when query bearer method is used', async () => {
    const doFetch = mockFetchSequence([{ status: 401 }, { status: 200, json: { ok: true } }]);
    const deps = buildApiRequestDeps({
      doFetch,
      bearerMethods: async () => ['query'],
    });

    const result = await apiRequest('/api/test', BASE, 'GET', null, null, deps);

    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(doFetch.calls.length, 2);
    // First request should have access_token in URL
    assert.ok(doFetch.calls[0].url.includes('access_token=test-token'));
    // Retry should have the new token in URL
    assert.ok(doFetch.calls[1].url.includes('access_token=new-token'));
    assert.ok(!doFetch.calls[1].url.includes('access_token=test-token'));
  });

  it('passes correct credentials source to refresh', async () => {
    const doFetch = mockFetchSequence([{ status: 401 }, { status: 200, json: {} }]);
    let refreshArgs;
    const deps = buildApiRequestDeps({
      doFetch,
      loadCreds: () => ({
        credentials: { accessToken: 'old', refreshToken: 'rt' },
        local: true,
      }),
      refresh: async (creds, apiBase, local) => {
        refreshArgs = { creds, apiBase, local };
        return { accessToken: 'new-token', refreshToken: 'rt' };
      },
    });

    await apiRequest('/api/test', BASE, 'GET', null, null, deps);

    assert.strictEqual(refreshArgs.local, true);
    assert.strictEqual(refreshArgs.apiBase, BASE);
    assert.strictEqual(refreshArgs.creds.refreshToken, 'rt');
  });
});
