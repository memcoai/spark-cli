import { createServer } from 'node:http';
import { URL } from 'node:url';
import open from 'open';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { getCurrentUser, getAuthMode } from '../api.js';
import { SparkOAuthProvider } from '../oauth-provider.js';
import { output, getParentOptions } from '../output.js';
import {
  printBanner,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  createSpinner,
  colorize,
} from '../banner.js';
import {
  getApiBase,
  validateApiBase,
  CALLBACK_PORT,
  getAuthSuccessUrl,
  getAuthErrorUrl,
  SETTINGS_PATH,
  LOCAL_SETTINGS_PATH,
} from '../constants.js';
import { readSettingsKey, writeSettingsKey } from '../settings.js';
import { fetchToolManifest } from '../tool-manifest.js';
import {
  loadCredentials,
  loadLocalCredentials,
  removeCredentials,
  isTokenExpired,
} from '../credentials.js';

/**
 * Start local server to receive OAuth callback.
 * Returns { server, port } — request handling is done by the caller.
 */
export function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${CALLBACK_PORT} is already in use. Please close any other applications using this port.`,
          ),
        );
      } else {
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      resolve({ server, port: CALLBACK_PORT });
    });
  });
}

/**
 * Redirect the browser to a URL.
 * Sends `Connection: close` so the loopback socket is not kept alive — otherwise an idle
 * keep-alive connection lingers and keeps the CLI process from exiting after login.
 */
export function redirect(res, url) {
  res.writeHead(302, { Location: url, Connection: 'close' });
  res.end();
}

/**
 * Shut down the callback server, dropping any lingering keep-alive connections so the CLI
 * process can exit. The browser's callback request may use HTTP keep-alive, which would
 * otherwise leave an idle socket holding the event loop open after login completes.
 * (closeAllConnections is available on Node >= 18.2.)
 */
export function closeCallbackServer(server) {
  try {
    server.close();
    server.closeAllConnections?.();
  } catch {
    // Best-effort shutdown; ignore errors.
  }
}

/**
 * Wait for the OAuth callback on the server.
 * Returns { code } on success. The PKCE verifier lives on the provider, so it is
 * no longer threaded through here.
 */
function waitForCallback(server, expectedState, apiBase) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        server.close();
        reject(new Error('Authentication timed out after 5 minutes'));
      },
      5 * 60 * 1000,
    );

    server.on('request', (req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      clearTimeout(timeout);

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        const errorUrl = new URL(getAuthErrorUrl(apiBase));
        errorUrl.searchParams.set('error', error);
        if (errorDescription) errorUrl.searchParams.set('message', errorDescription);
        redirect(res, errorUrl.toString());
        server.close();
        reject(new Error(errorDescription || error));
        return;
      }

      if (state !== expectedState) {
        const errorUrl = new URL(getAuthErrorUrl(apiBase));
        errorUrl.searchParams.set('error', 'invalid_state');
        errorUrl.searchParams.set('message', 'Security validation failed. Please try again.');
        redirect(res, errorUrl.toString());
        server.close();
        reject(new Error('Invalid state parameter'));
        return;
      }

      if (!code) {
        const errorUrl = new URL(getAuthErrorUrl(apiBase));
        errorUrl.searchParams.set('error', 'missing_code');
        errorUrl.searchParams.set('message', 'No authorization code received.');
        redirect(res, errorUrl.toString());
        server.close();
        reject(new Error('No authorization code received'));
        return;
      }

      redirect(res, getAuthSuccessUrl(apiBase));
      server.close();
      resolve({ code });
    });
  });
}

/**
 * Check existing credentials and attempt refresh if expired.
 * Returns 'skip' if login should be skipped, 'continue' if login should proceed.
 */
export async function checkExistingAuth(options, apiBase, deps = {}) {
  const {
    loadCreds = loadCredentials,
    loadLocalCreds = loadLocalCredentials,
    isExpired = isTokenExpired,
    runAuth = auth,
    // Silent refresh-check: a dead refresh token must NOT pop a browser here
    // (we fall through to the interactive login flow instead), so build the
    // provider non-interactive.
    makeProvider = (base, opts) => new SparkOAuthProvider(base, { ...opts, interactive: false }),
    removeCreds = removeCredentials,
    getUser = getCurrentUser,
  } = deps;

  let existing;
  let isLocal;
  if (options.local) {
    existing = loadLocalCreds(apiBase);
    isLocal = true;
  } else {
    const result = loadCreds(apiBase, { withSource: true });
    existing = result.credentials;
    isLocal = result.local;
  }
  if (!existing?.accessToken && !existing?.apiKey) {
    return 'continue';
  }

  if (existing.accessToken && isExpired(existing)) {
    // A valid refresh token lets the SDK's auth() refresh-and-save without a browser.
    const provider = makeProvider(apiBase, { local: isLocal });
    try {
      await runAuth(provider, { serverUrl: `${apiBase}/mcp` });
    } catch {
      removeCreds(apiBase);
      return 'continue';
    }

    try {
      await getUser(apiBase);
      printInfo('Your session has been refreshed. You are logged in.');
      return 'skip';
    } catch {
      removeCreds(apiBase);
      return 'continue';
    }
  }

  printInfo('You are already logged in.');
  console.log('');
  console.log(`Run ${colorize('\x1b[33m', 'spark logout')} first to log out, then try again.`);
  console.log(`Or run ${colorize('\x1b[33m', 'spark whoami')} to see your account info.`);
  return 'skip';
}

/**
 * Run the OAuth browser flow via the SDK's `auth()` orchestrator.
 *
 * Two `auth()` calls drive the flow against a `SparkOAuthProvider`:
 *   1. `auth(provider, { serverUrl })` runs discovery + DCR + PKCE, builds the
 *      authorize URL, and hands it to the provider's `redirectToAuthorization`
 *      (which appends `provider=authkit` and opens the browser), returning
 *      `'REDIRECT'`. (If a still-valid refresh token exists it returns
 *      `'AUTHORIZED'` instead — tokens are already saved, nothing more to do.)
 *   2. After the loopback server captures the `?code=`, `auth(provider, {
 *      serverUrl, authorizationCode })` exchanges it for tokens and calls the
 *      provider's `saveTokens`, returning `'AUTHORIZED'`.
 *
 * The localhost loopback redirect server (port, redirect URLs, keep-alive
 * cleanup, 5-min timeout, `state` validation against the provider) is kept; the
 * PKCE verifier now lives on the provider, not on the callback result.
 *
 * Returns `{ authorized: true, tokenSpinner? }` on success, or `null` if the
 * callback server failed to start.
 */
export async function runOAuthFlow(apiBase, options = {}, deps = {}) {
  const {
    runAuth = auth,
    // Interactive login flow: a redirect SHOULD open the browser (and print the
    // manual-login fallback URL), so build the provider interactive.
    makeProvider = (base, opts) => new SparkOAuthProvider(base, { ...opts, interactive: true }),
    startServer = startCallbackServer,
    waitCb = waitForCallback,
  } = deps;

  let serverInfo;
  try {
    serverInfo = await startServer();
  } catch (err) {
    printError(`Failed to start callback server: ${err.message}`);
    console.log('');
    printApiKeyFallback(apiBase);
    return null;
  }

  const { server } = serverInfo;
  const provider = makeProvider(apiBase, { local: options.local });
  const serverUrl = `${apiBase}/mcp`;

  try {
    console.log('Opening browser for authentication...');
    console.log('');

    // First auth() call: discovery + DCR + PKCE + open the browser via the
    // provider's redirectToAuthorization (which appends provider=authkit).
    const result = await runAuth(provider, { serverUrl });
    if (result !== 'REDIRECT') {
      // A still-valid refresh token let auth() refresh in-place; tokens are saved.
      return { authorized: true };
    }

    const spinner = createSpinner('Waiting for authentication...');
    let cb;
    try {
      cb = await waitCb(server, provider.state(), apiBase);
      spinner.stop('Browser authentication complete');
    } catch (err) {
      spinner.fail('Authentication failed');
      throw err;
    }

    const tokenSpinner = createSpinner('Exchanging code for tokens...');
    try {
      // Second auth() call: exchange code -> tokens; provider.saveTokens persists.
      await runAuth(provider, { serverUrl, authorizationCode: cb.code });
      return { authorized: true, tokenSpinner };
    } catch (err) {
      tokenSpinner.fail('Token exchange failed');
      throw err;
    }
  } finally {
    closeCallbackServer(server);
  }
}

/**
 * Resolve and optionally persist the API base URL from command options.
 * Returns the resolved apiBase, or undefined if validation failed (after calling process.exit).
 */
export function resolveApiBase(options, deps = {}) {
  const {
    validate = validateApiBase,
    getBase = getApiBase,
    writeKey = writeSettingsKey,
    readKey = readSettingsKey,
  } = deps;

  if (!options.apiBase) return getBase();

  const apiBase = validate(options.apiBase);
  if (!apiBase) {
    printError(`Invalid API base URL: ${options.apiBase}`);
    process.exit(1);
    return undefined;
  }

  const settingsPath = options.local ? LOCAL_SETTINGS_PATH : SETTINGS_PATH;
  writeKey(settingsPath, 'apiBase', apiBase);

  // Also update local settings if they exist with a different apiBase,
  // so the local value doesn't shadow the intended URL.
  if (!options.local) {
    const localApiBase = readKey(LOCAL_SETTINGS_PATH, 'apiBase');
    if (localApiBase && localApiBase !== apiBase) {
      writeKey(LOCAL_SETTINGS_PATH, 'apiBase', apiBase);
    }
  }

  printInfo(`API base set to ${apiBase}`);
  console.log('');
  return apiBase;
}

/**
 * Populate the tool manifest cache after a successful login (best-effort, fail-open).
 * A manifest-fetch failure must never abort a successful login — it only warns.
 * The `local` flag mirrors `login --local` so the manifest lands next to the credentials.
 */
export async function populateToolManifest(apiBase, local, deps = {}) {
  const { fetchManifest = fetchToolManifest } = deps;
  try {
    await fetchManifest(apiBase, { local });
  } catch (error) {
    printWarning(`Could not load tool manifest: ${error.message}`);
  }
}

/**
 * Login command handler — drives the SDK OAuth flow via `runOAuthFlow`.
 *
 * The provider (inside `runOAuthFlow`) now persists credentials via its
 * `saveTokens` during the second `auth()` call, so there is no manual
 * `saveCredentials` block here — login only verifies and reports.
 */
export async function loginCommand(options, _command, deps = {}) {
  const {
    fetchManifest = fetchToolManifest,
    runFlow = runOAuthFlow,
    getUser = getCurrentUser,
  } = deps;
  const apiBase = resolveApiBase(options);
  if (!apiBase) return;
  try {
    printBanner();
    console.log('');

    if (process.env.SPARK_API_KEY) {
      printInfo('You are authenticated via SPARK_API_KEY environment variable.');
      console.log('');
      console.log('To use OAuth instead, unset the environment variable:');
      console.log(`  ${colorize('\x1b[33m', 'unset SPARK_API_KEY')}`);
      return;
    }

    const authCheck = await checkExistingAuth(options, apiBase, deps.checkAuthDeps);
    if (authCheck === 'skip') return;

    console.log(colorize('\x1b[1m', 'Spark CLI Authentication'));
    console.log('');

    const flowResult = await runFlow(apiBase, options, deps.flowDeps);
    if (!flowResult) return;

    // Tokens were already saved by the provider's saveTokens (inside auth()).
    const { tokenSpinner } = flowResult;
    const local = options.local || false;
    const location = local ? 'locally (.spark/)' : 'globally (~/.spark/)';
    tokenSpinner?.stop(`Credentials saved ${location}`);

    // Verify login by calling getUser
    const verifySpinner = createSpinner('Verifying login...');
    try {
      await getUser(apiBase);
      verifySpinner.stop('Login verified');
    } catch (error) {
      verifySpinner.fail('Login verification failed');
      printWarning(`Could not verify login: ${error.message}`);
    }

    // Populate the tool manifest cache so offline --help is fresh (best-effort, fail-open).
    await populateToolManifest(apiBase, local, { fetchManifest });

    console.log('');
    printSuccess('Successfully logged in to Spark!');
    console.log('');
    console.log(`Run ${colorize('\x1b[33m', 'spark whoami')} to see your account info.`);
  } catch (err) {
    exitWithLoginError(err, apiBase);
  }
}

/**
 * Abort login with an informative failure: tell the user what went wrong (the error message plus
 * the API-key fallback) and flag a non-zero exit code. Uses `process.exitCode` rather than an
 * abrupt `process.exit(1)` so buffered output and any pending work still flush before exit.
 */
function exitWithLoginError(err, apiBase) {
  printError(`Login failed: ${err.message}`);
  console.log('');
  printApiKeyFallback(apiBase);
  process.exitCode = 1;
}

/**
 * Validate a server-supplied logout redirect URL before opening it in a browser.
 * Accepts only http(s) URLs whose origin matches the configured api base — this
 * prevents a compromised/spoofed server response from opening an arbitrary
 * (e.g. `file:`, `javascript:`, or off-origin phishing) URL on the user's machine.
 *
 * @param {string} redirectUrl - the `Location` header value from the server.
 * @param {string} apiBase - the configured api base URL.
 * @returns {boolean}
 */
export function isSafeLogoutRedirect(redirectUrl, apiBase) {
  try {
    const target = new URL(redirectUrl);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return false;
    }
    return target.origin === new URL(apiBase).origin;
  } catch {
    return false;
  }
}

function printApiKeyFallback(apiBase) {
  const base = apiBase || getApiBase();
  console.log(`${colorize('\x1b[33m', 'Alternative:')} Use an API key instead:`);
  console.log(`  1. Visit: ${colorize('\x1b[36m', `${base}/settings/api`)}`);
  console.log('  2. Generate an API key');
  console.log(`  3. Run: ${colorize('\x1b[33m', 'export SPARK_API_KEY=your_api_key')}`);
}

/**
 * Logout command handler
 */
export async function logoutCommand() {
  try {
    const apiBase = getApiBase();
    // Server-side logout (best-effort). Only OAuth sessions have a server-side
    // session to revoke; api-key sessions (legacy stored key or env var) have no
    // server logout endpoint, so we skip it gracefully and just clear local state.
    const credentials = loadCredentials();
    if (credentials?.accessToken && !credentials?.apiKey && !credentials?.token) {
      printInfo('Logging out of Spark server...');
      try {
        const response = await fetch(`${apiBase}/auth/logout-all`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
          redirect: 'manual',
        });

        const redirectUrl = response.headers.get('location');
        // Validate the server-controlled redirect before opening a browser: it
        // must be http/https AND share the api-base origin. Otherwise skip it
        // (never open an attacker-controlled or off-origin/non-web URL).
        if (redirectUrl && isSafeLogoutRedirect(redirectUrl, apiBase)) {
          await open(redirectUrl);
        }
      } catch (err) {
        printWarning(`Failed to reach Spark server: ${err.message}`);
      }
    }

    const removed = removeCredentials();
    if (removed) {
      const location = removed === 'local' ? 'local (.spark/)' : 'global (~/.spark/)';
      printSuccess(`Logged out successfully. Removed ${location} credentials.`);
    } else {
      printInfo(
        'No credentials file found. You may still be authenticated via SPARK_API_KEY environment variable.',
      );
    }
  } catch (err) {
    printError(err.message);
    process.exit(1);
  }
}

/**
 * Detect a network/connectivity failure (as opposed to an auth failure).
 *
 * `getCurrentUser` propagates the raw `fetch` rejection on connectivity
 * failures — it only wraps non-2xx HTTP responses as `API error (status)` — so
 * `cause.code` detection is reliable here.
 */
function isNetworkError(err) {
  const code = err?.cause?.code ?? err?.code;
  if (typeof code === 'string') {
    return /^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE|UND_ERR)/.test(
      code,
    );
  }
  return /fetch failed|network|getaddrinfo|socket hang up|dns/i.test(err?.message ?? '');
}

/**
 * Whoami command handler
 */
export async function whoamiCommand(_options, command) {
  try {
    const user = await getCurrentUser(undefined, command);
    output(user, command);
  } catch (err) {
    // Connectivity failure: surface it on its own branch, distinct from auth.
    // Do NOT emit an `authenticated` verdict — we never reached the server.
    if (isNetworkError(err)) {
      output(
        {
          reachable: false,
          message: 'Could not reach Spark — check your network connection.',
          error: err.message,
        },
        command,
      );
      return;
    }

    // Server was reachable: derive the configured auth mode. This covers the
    // global `--api-key` flag, SPARK_API_KEY, a stored key, and OAuth.
    const mode = getAuthMode(getApiBase(), { apiKey: getParentOptions(command).apiKey });
    if (mode) {
      output(
        {
          authenticated: true,
          method: mode,
          message: 'Authenticated, but could not fetch user info',
          error: err.message,
        },
        command,
      );
    } else {
      output(
        {
          authenticated: false,
          message: 'Not authenticated. Run `spark login` to authenticate.',
        },
        command,
      );
    }
  }
}
