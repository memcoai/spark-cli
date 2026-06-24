import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH } from '../src/constants.js';
import {
  TOOL_MANIFEST_TTL_MS,
  getActiveSettingsPath,
  getCachedToolManifest,
  fetchToolManifest,
  checkToolManifest,
  getManifestForRegistration,
} from '../src/tool-manifest.js';

const API = 'https://spark.memco.ai';
const OTHER_API = 'https://staging.memco.ai';

/**
 * Build an in-memory settings store plus DI deps for the manifest module.
 * `store` maps a settings path -> the value stored under the `toolManifest` key.
 */
function buildDeps(overrides = {}) {
  const store = overrides.store ?? {};
  return {
    store,
    deps: {
      getBase: overrides.getBase ?? (() => API),
      exists: overrides.exists ?? (() => false),
      readKey:
        overrides.readKey ??
        ((path, key) => (key === 'toolManifest' ? (store[path] ?? null) : null)),
      writeKey:
        overrides.writeKey ??
        mock.fn((path, key, value) => {
          if (key === 'toolManifest') store[path] = value;
        }),
      list: overrides.list ?? mock.fn(async () => []),
    },
  };
}

const serverTools = [
  {
    name: 'search',
    description: 'Query the knowledge network',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'enrich_memory',
    description: 'Share an insight',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
  },
  // Any tool registers under its server name verbatim.
  {
    name: 'brand_new_tool',
    description: 'A new tool',
    inputSchema: { type: 'object' },
  },
];

describe('tool-manifest', () => {
  describe('constants', () => {
    it('TTL is 1h', () => {
      assert.strictEqual(TOOL_MANIFEST_TTL_MS, 60 * 60 * 1000);
    });
  });

  describe('getActiveSettingsPath', () => {
    it('returns local path when local settings exist', () => {
      assert.strictEqual(getActiveSettingsPath({ exists: () => true }), LOCAL_SETTINGS_PATH);
    });

    it('returns global path when local settings do not exist', () => {
      assert.strictEqual(getActiveSettingsPath({ exists: () => false }), SETTINGS_PATH);
    });
  });

  describe('getCachedToolManifest', () => {
    it('returns the cached manifest from the global path', () => {
      const cache = { tools: [], checkedAt: Date.now(), apiBase: API };
      const { deps } = buildDeps({ store: { [SETTINGS_PATH]: cache } });
      assert.deepStrictEqual(getCachedToolManifest(deps), cache);
    });

    it('prefers the local manifest over the global one', () => {
      const local = { tools: [], checkedAt: 1, apiBase: API };
      const global = { tools: [], checkedAt: 2, apiBase: OTHER_API };
      const { deps } = buildDeps({
        store: { [LOCAL_SETTINGS_PATH]: local, [SETTINGS_PATH]: global },
      });
      assert.deepStrictEqual(getCachedToolManifest(deps), local);
    });

    it('fails open (returns null) on a missing cache', () => {
      const { deps } = buildDeps();
      assert.strictEqual(getCachedToolManifest(deps), null);
    });

    it('fails open (returns null) on a corrupt cache', () => {
      // Missing required serverName / checkedAt — schema safeParse fails.
      const { deps } = buildDeps({
        store: { [SETTINGS_PATH]: { tools: [{ description: 'x' }], apiBase: API } },
      });
      assert.strictEqual(getCachedToolManifest(deps), null);
    });
  });

  describe('fetchToolManifest', () => {
    it('writes {tools, checkedAt, apiBase} with verbatim serverName (no name field)', async () => {
      const { store, deps } = buildDeps({
        exists: () => false,
        list: mock.fn(async () => serverTools),
      });
      const result = await fetchToolManifest(API, {}, deps);

      assert.ok(result);
      assert.strictEqual(result.apiBase, API);
      assert.strictEqual(typeof result.checkedAt, 'number');

      // Pure reflection: server tool.name maps verbatim to entry.serverName,
      // and entries carry no friendly `name` field.
      assert.deepStrictEqual(
        result.tools.map((t) => t.serverName),
        ['search', 'enrich_memory', 'brand_new_tool'],
      );
      for (const t of result.tools) {
        assert.ok(!('name' in t), 'entry has no name field');
      }

      // Schemas/description carried through.
      assert.deepStrictEqual(result.tools[0].inputSchema, serverTools[0].inputSchema);
      assert.deepStrictEqual(result.tools[1].outputSchema, serverTools[1].outputSchema);

      // Written to the active (global, since exists()=>false) settings path.
      assert.deepStrictEqual(store[SETTINGS_PATH], result);
      assert.strictEqual(deps.writeKey.mock.calls[0].arguments[1], 'toolManifest');
    });

    it('honors an explicit local=true write location', async () => {
      const { store, deps } = buildDeps({ list: mock.fn(async () => serverTools) });
      await fetchToolManifest(API, { local: true }, deps);
      assert.ok(store[LOCAL_SETTINGS_PATH]);
      assert.strictEqual(store[SETTINGS_PATH], undefined);
    });

    it('honors an explicit local=false write location', async () => {
      const { store, deps } = buildDeps({
        exists: () => true,
        list: mock.fn(async () => serverTools),
      });
      await fetchToolManifest(API, { local: false }, deps);
      assert.ok(store[SETTINGS_PATH]);
      assert.strictEqual(store[LOCAL_SETTINGS_PATH], undefined);
    });

    it('uses the active path (local when local settings exist) when local is omitted', async () => {
      const { store, deps } = buildDeps({
        exists: () => true,
        list: mock.fn(async () => serverTools),
      });
      await fetchToolManifest(API, {}, deps);
      assert.ok(store[LOCAL_SETTINGS_PATH]);
      assert.strictEqual(store[SETTINGS_PATH], undefined);
    });

    it('falls back to getBase() when apiBase is omitted', async () => {
      const { deps } = buildDeps({ list: mock.fn(async () => serverTools) });
      const result = await fetchToolManifest(undefined, {}, deps);
      assert.strictEqual(result.apiBase, API);
    });

    it('fails open (returns null, no write) when listTools throws', async () => {
      const { store, deps } = buildDeps({
        list: mock.fn(async () => {
          throw new Error('network down');
        }),
      });
      const result = await fetchToolManifest(API, {}, deps);
      assert.strictEqual(result, null);
      assert.deepStrictEqual(store, {});
    });
  });

  describe('checkToolManifest', () => {
    it('returns the cache when fresh and apiBase matches (no fetch)', async () => {
      const cache = {
        tools: [{ serverName: 'search' }],
        checkedAt: Date.now(),
        apiBase: API,
      };
      const list = mock.fn(async () => serverTools);
      const { deps } = buildDeps({ store: { [SETTINGS_PATH]: cache }, list });
      const result = await checkToolManifest(API, deps);
      assert.deepStrictEqual(result, cache);
      assert.strictEqual(list.mock.calls.length, 0);
    });

    it('re-fetches when the cache is stale', async () => {
      const cache = {
        tools: [{ serverName: 'search' }],
        checkedAt: Date.now() - (TOOL_MANIFEST_TTL_MS + 1000),
        apiBase: API,
      };
      const list = mock.fn(async () => serverTools);
      const { deps } = buildDeps({ store: { [SETTINGS_PATH]: cache }, list });
      const result = await checkToolManifest(API, deps);
      assert.strictEqual(list.mock.calls.length, 1);
      assert.strictEqual(result.tools.length, serverTools.length);
    });

    it('re-fetches when the cached apiBase differs', async () => {
      const cache = {
        tools: [{ serverName: 'search' }],
        checkedAt: Date.now(),
        apiBase: OTHER_API,
      };
      const list = mock.fn(async () => serverTools);
      const { deps } = buildDeps({ store: { [SETTINGS_PATH]: cache }, list });
      await checkToolManifest(API, deps);
      assert.strictEqual(list.mock.calls.length, 1);
    });

    it('returns null (fail-open) when a stale re-fetch fails', async () => {
      const cache = {
        tools: [{ serverName: 'search' }],
        checkedAt: Date.now() - (TOOL_MANIFEST_TTL_MS + 1000),
        apiBase: API,
      };
      const list = mock.fn(async () => {
        throw new Error('offline');
      });
      const { deps } = buildDeps({ store: { [SETTINGS_PATH]: cache }, list });
      assert.strictEqual(await checkToolManifest(API, deps), null);
    });
  });

  describe('getManifestForRegistration', () => {
    it('returns the cached tools for the current apiBase — offline, no network', () => {
      const cache = {
        tools: [{ serverName: 'search' }],
        checkedAt: Date.now(),
        apiBase: API,
      };
      const list = mock.fn(async () => serverTools);
      const { deps } = buildDeps({ store: { [SETTINGS_PATH]: cache }, list });
      const tools = getManifestForRegistration(API, deps);
      assert.deepStrictEqual(tools, cache.tools);
      assert.strictEqual(list.mock.calls.length, 0);
    });

    it('returns [] for a foreign apiBase with the SDK/fetch mock never invoked', () => {
      const cache = {
        tools: [{ serverName: 'search' }],
        checkedAt: Date.now(),
        apiBase: OTHER_API,
      };
      const list = mock.fn(async () => serverTools);
      const { deps } = buildDeps({ store: { [SETTINGS_PATH]: cache }, list });
      assert.deepStrictEqual(getManifestForRegistration(API, deps), []);
      assert.strictEqual(list.mock.calls.length, 0);
    });

    it('returns [] when no cache exists', () => {
      const list = mock.fn(async () => serverTools);
      const { deps } = buildDeps({ list });
      assert.deepStrictEqual(getManifestForRegistration(API, deps), []);
      assert.strictEqual(list.mock.calls.length, 0);
    });
  });
});
