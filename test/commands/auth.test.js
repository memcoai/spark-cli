import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import { setupCommandMocks, getLogOutput } from '../helpers.js';
import {
  checkExistingAuth,
  resolveApiBase,
  redirect,
  closeCallbackServer,
} from '../../src/commands/auth.js';
import { SETTINGS_PATH, LOCAL_SETTINGS_PATH } from '../../src/constants.js';

describe('checkExistingAuth', () => {
  const mocks = setupCommandMocks();

  const baseDeps = {
    loadCreds: () => ({ credentials: null, local: false }),
    loadLocalCreds: () => null,
    isExpired: () => false,
    refresh: async () => {},
    removeCreds: () => {},
    getUser: async () => ({}),
  };

  it('returns continue when no credentials exist', async () => {
    const result = await checkExistingAuth({}, undefined, { ...baseDeps });
    assert.strictEqual(result, 'continue');
  });

  it('returns skip when valid access token exists', async () => {
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ credentials: { accessToken: 'tok' }, local: false }),
    });
    assert.strictEqual(result, 'skip');
    assert.match(getLogOutput(mocks.logMock), /already logged in/);
  });

  it('returns skip when api key exists', async () => {
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ credentials: { apiKey: 'key123' }, local: false }),
    });
    assert.strictEqual(result, 'skip');
    assert.match(getLogOutput(mocks.logMock), /already logged in/);
  });

  it('returns skip after successful token refresh', async () => {
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ credentials: { accessToken: 'tok', refreshToken: 'ref' }, local: false }),
      isExpired: () => true,
      refresh: async () => {},
    });
    assert.strictEqual(result, 'skip');
    assert.match(getLogOutput(mocks.logMock), /session has been refreshed/);
  });

  it('returns continue and removes credentials when refresh fails', async () => {
    let removeCalled = false;
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ credentials: { accessToken: 'tok', refreshToken: 'ref' }, local: false }),
      isExpired: () => true,
      refresh: async () => {
        throw new Error('refresh failed');
      },
      removeCreds: () => {
        removeCalled = true;
      },
    });
    assert.strictEqual(result, 'continue');
    assert.strictEqual(removeCalled, true);
  });

  it('uses loadLocalCreds when --local flag is set', async () => {
    let localCalled = false;
    let globalCalled = false;
    await checkExistingAuth({ local: true }, undefined, {
      ...baseDeps,
      loadCreds: () => {
        globalCalled = true;
        return null;
      },
      loadLocalCreds: () => {
        localCalled = true;
        return null;
      },
    });
    assert.strictEqual(localCalled, true);
    assert.strictEqual(globalCalled, false);
  });

  it('uses loadCreds when --local flag is not set', async () => {
    let globalCalled = false;
    let localCalled = false;
    await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => {
        globalCalled = true;
        return { credentials: null, local: false };
      },
      loadLocalCreds: () => {
        localCalled = true;
        return null;
      },
    });
    assert.strictEqual(globalCalled, true);
    assert.strictEqual(localCalled, false);
  });

  it('passes local flag from source detection to refresh', async () => {
    let refreshLocal;
    await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ credentials: { accessToken: 'tok', refreshToken: 'ref' }, local: true }),
      isExpired: () => true,
      refresh: async (_creds, _apiBase, local) => {
        refreshLocal = local;
      },
    });
    assert.strictEqual(refreshLocal, true);
  });

  it('passes local=true to refresh when --local flag is set', async () => {
    let refreshLocal;
    await checkExistingAuth({ local: true }, undefined, {
      ...baseDeps,
      loadLocalCreds: () => ({ accessToken: 'tok', refreshToken: 'ref' }),
      isExpired: () => true,
      refresh: async (_creds, _apiBase, local) => {
        refreshLocal = local;
      },
    });
    assert.strictEqual(refreshLocal, true);
  });

  it('returns continue and removes credentials when refresh succeeds but getUser fails', async () => {
    let removeCalled = false;
    const result = await checkExistingAuth({}, undefined, {
      ...baseDeps,
      loadCreds: () => ({ credentials: { accessToken: 'tok', refreshToken: 'ref' }, local: false }),
      isExpired: () => true,
      refresh: async () => {},
      getUser: async () => {
        throw new Error('unauthorized');
      },
      removeCreds: () => {
        removeCalled = true;
      },
    });
    assert.strictEqual(result, 'continue');
    assert.strictEqual(removeCalled, true);
  });
});

describe('resolveApiBase', () => {
  const mocks = setupCommandMocks();

  const baseDeps = {
    validate: (url) => (url.startsWith('http') ? url.replace(/\/+$/, '') : undefined),
    getBase: () => 'https://spark.memco.ai',
    writeKey: mock.fn(),
    readKey: () => null,
  };

  it('returns default apiBase when no --api-base option is provided', () => {
    const result = resolveApiBase({}, { ...baseDeps });
    assert.strictEqual(result, 'https://spark.memco.ai');
  });

  it('exits with error for invalid --api-base URL', () => {
    const deps = { ...baseDeps, validate: () => undefined };

    resolveApiBase({ apiBase: 'not-a-url' }, deps);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    assert.strictEqual(mocks.exitMock.mock.calls[0].arguments[0], 1);
    assert.match(getLogOutput(mocks.logMock), /Invalid API base URL/);
  });

  it('writes apiBase to global settings by default', () => {
    const writeKey = mock.fn();
    const deps = { ...baseDeps, writeKey };

    const result = resolveApiBase({ apiBase: 'https://custom.example.com' }, deps);

    assert.strictEqual(result, 'https://custom.example.com');
    assert.strictEqual(writeKey.mock.calls.length, 1);
    assert.strictEqual(writeKey.mock.calls[0].arguments[0], SETTINGS_PATH);
    assert.strictEqual(writeKey.mock.calls[0].arguments[1], 'apiBase');
    assert.strictEqual(writeKey.mock.calls[0].arguments[2], 'https://custom.example.com');
  });

  it('writes apiBase to local settings when --local flag is set', () => {
    const writeKey = mock.fn();
    const deps = { ...baseDeps, writeKey };

    const result = resolveApiBase({ apiBase: 'https://custom.example.com', local: true }, deps);

    assert.strictEqual(result, 'https://custom.example.com');
    assert.strictEqual(writeKey.mock.calls.length, 1);
    assert.strictEqual(writeKey.mock.calls[0].arguments[0], LOCAL_SETTINGS_PATH);
  });

  it('does not write to settings when no --api-base is provided', () => {
    const writeKey = mock.fn();
    const deps = { ...baseDeps, writeKey };

    resolveApiBase({}, deps);

    assert.strictEqual(writeKey.mock.calls.length, 0);
  });

  it('uses the validated/normalized URL from validate', () => {
    const writeKey = mock.fn();
    const deps = {
      ...baseDeps,
      validate: () => 'https://normalized.example.com',
      writeKey,
    };

    const result = resolveApiBase({ apiBase: 'https://normalized.example.com///' }, deps);

    assert.strictEqual(result, 'https://normalized.example.com');
    assert.strictEqual(writeKey.mock.calls[0].arguments[2], 'https://normalized.example.com');
  });

  it('also writes to local settings when local apiBase exists and differs', () => {
    const writeKey = mock.fn();
    const deps = {
      ...baseDeps,
      writeKey,
      readKey: () => 'http://localhost:8080',
    };

    resolveApiBase({ apiBase: 'https://custom.example.com' }, deps);

    assert.strictEqual(writeKey.mock.calls.length, 2);
    assert.strictEqual(writeKey.mock.calls[0].arguments[0], SETTINGS_PATH);
    assert.strictEqual(writeKey.mock.calls[1].arguments[0], LOCAL_SETTINGS_PATH);
    assert.strictEqual(writeKey.mock.calls[1].arguments[2], 'https://custom.example.com');
  });

  it('does not write to local settings when local apiBase matches', () => {
    const writeKey = mock.fn();
    const deps = {
      ...baseDeps,
      writeKey,
      readKey: () => 'https://custom.example.com',
    };

    resolveApiBase({ apiBase: 'https://custom.example.com' }, deps);

    assert.strictEqual(writeKey.mock.calls.length, 1);
    assert.strictEqual(writeKey.mock.calls[0].arguments[0], SETTINGS_PATH);
  });

  it('does not write to local settings when no local apiBase exists', () => {
    const writeKey = mock.fn();
    const deps = {
      ...baseDeps,
      writeKey,
      readKey: () => null,
    };

    resolveApiBase({ apiBase: 'https://custom.example.com' }, deps);

    assert.strictEqual(writeKey.mock.calls.length, 1);
    assert.strictEqual(writeKey.mock.calls[0].arguments[0], SETTINGS_PATH);
  });

  it('does not update local settings when --local flag is set', () => {
    const writeKey = mock.fn();
    const readKey = mock.fn(() => 'http://localhost:8080');
    const deps = {
      ...baseDeps,
      writeKey,
      readKey,
    };

    resolveApiBase({ apiBase: 'https://custom.example.com', local: true }, deps);

    assert.strictEqual(writeKey.mock.calls.length, 1);
    assert.strictEqual(writeKey.mock.calls[0].arguments[0], LOCAL_SETTINGS_PATH);
    assert.strictEqual(readKey.mock.calls.length, 0);
  });
});

describe('redirect', () => {
  it('sends Connection: close so the loopback socket does not keep the CLI alive', () => {
    const headers = {};
    const res = {
      writeHead: (status, h) => {
        res.status = status;
        Object.assign(headers, h);
      },
      end: mock.fn(),
    };

    redirect(res, 'https://spark.memco.ai/cli/auth_success');

    assert.strictEqual(res.status, 302);
    assert.strictEqual(headers.Location, 'https://spark.memco.ai/cli/auth_success');
    assert.strictEqual(headers.Connection, 'close');
    assert.strictEqual(res.end.mock.calls.length, 1);
  });
});

describe('closeCallbackServer', () => {
  it('calls close() and closeAllConnections() to drop lingering sockets', () => {
    const server = { close: mock.fn(), closeAllConnections: mock.fn() };

    closeCallbackServer(server);

    assert.strictEqual(server.close.mock.calls.length, 1);
    assert.strictEqual(server.closeAllConnections.mock.calls.length, 1);
  });

  it('does not throw when closeAllConnections is unavailable (older Node)', () => {
    const server = { close: mock.fn() };
    assert.doesNotThrow(() => closeCallbackServer(server));
    assert.strictEqual(server.close.mock.calls.length, 1);
  });

  it('swallows errors thrown during shutdown', () => {
    const server = {
      close: () => {
        throw new Error('already closed');
      },
    };
    assert.doesNotThrow(() => closeCallbackServer(server));
  });

  it(
    'releases a real server with a lingering keep-alive connection',
    { timeout: 5000 },
    async () => {
      // A browser keeps its callback socket alive; with only server.close() the idle socket would
      // keep the event loop open and the CLI would hang. This proves closeCallbackServer releases it.
      const server = createServer((req, res) => {
        res.writeHead(200, { Connection: 'keep-alive', 'Content-Length': '2' });
        res.end('ok');
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();

      const socket = net.connect(port, '127.0.0.1');
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
      });
      socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n');
      await new Promise((resolve) => socket.once('data', resolve));

      const closed = new Promise((resolve) => server.once('close', resolve));
      closeCallbackServer(server);
      await closed; // would hang past the timeout if the keep-alive socket were not dropped

      socket.destroy();
    },
  );
});
