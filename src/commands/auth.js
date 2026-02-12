import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { URL } from 'node:url';
import open from 'open';
import { getCurrentUser } from '../api.js';
import { getClientId, getOAuthEndpoints } from '../oauth.js';
import { output } from '../output.js';
import {
  printBanner,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  createSpinner,
  colorize,
} from '../banner.js';
import { API_BASE, CALLBACK_PORT, AUTH_SUCCESS_URL, AUTH_ERROR_URL } from '../constants.js';
import {
  loadCredentials,
  loadLocalCredentials,
  saveCredentials,
  credentialsExist,
  removeCredentials,
} from '../credentials.js';

/**
 * Generate PKCE code verifier (random string)
 */
function generateCodeVerifier() {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier
 */
function generateCodeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Generate random state for CSRF protection
 */
function generateState() {
  return randomBytes(16).toString('hex');
}

/**
 * Start local server to receive OAuth callback.
 * Returns { server, port } — request handling is done by the caller.
 */
function startCallbackServer() {
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
 * Redirect the browser to a URL
 */
function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}

/**
 * Wait for the OAuth callback on the server.
 * Returns { code, codeVerifier } on success.
 */
function waitForCallback(server, expectedState, codeVerifier) {
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
        const errorUrl = new URL(AUTH_ERROR_URL);
        errorUrl.searchParams.set('error', error);
        if (errorDescription) errorUrl.searchParams.set('message', errorDescription);
        redirect(res, errorUrl.toString());
        server.close();
        reject(new Error(errorDescription || error));
        return;
      }

      if (state !== expectedState) {
        const errorUrl = new URL(AUTH_ERROR_URL);
        errorUrl.searchParams.set('error', 'invalid_state');
        errorUrl.searchParams.set('message', 'Security validation failed. Please try again.');
        redirect(res, errorUrl.toString());
        server.close();
        reject(new Error('Invalid state parameter'));
        return;
      }

      if (!code) {
        const errorUrl = new URL(AUTH_ERROR_URL);
        errorUrl.searchParams.set('error', 'missing_code');
        errorUrl.searchParams.set('message', 'No authorization code received.');
        redirect(res, errorUrl.toString());
        server.close();
        reject(new Error('No authorization code received'));
        return;
      }

      redirect(res, AUTH_SUCCESS_URL);
      server.close();
      resolve({ code, codeVerifier });
    });
  });
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, codeVerifier, redirectUri) {
  const { tokenEndpoint } = await getOAuthEndpoints();
  const clientId = await getClientId(redirectUri);
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.accessToken || data.access_token,
    refresh_token: data.refreshToken || data.refresh_token,
    expires_in: data.expiresIn || data.expires_in,
    token_type: 'Bearer',
  };
}

/**
 * Login command handler - OAuth PKCE flow
 */
export async function loginCommand(options, _command) {
  let spinner;
  let tokenSpinner;
  let serverInfo;

  try {
    printBanner();
    console.log('');

    // Check if already authenticated (scope-aware when --local is used)
    const existing = options.local ? loadLocalCredentials() : loadCredentials();
    if (existing?.accessToken || existing?.apiKey) {
      printInfo('You are already logged in.');
      console.log('');
      console.log(`Run ${colorize('\x1b[33m', 'spark logout')} first to log out, then try again.`);
      console.log(`Or run ${colorize('\x1b[33m', 'spark whoami')} to see your account info.`);
      return;
    }

    // Check for API key in environment
    if (process.env.SPARK_API_KEY) {
      printInfo('You are authenticated via SPARK_API_KEY environment variable.');
      console.log('');
      console.log('To use OAuth instead, unset the environment variable:');
      console.log(`  ${colorize('\x1b[33m', 'unset SPARK_API_KEY')}`);
      return;
    }

    console.log(colorize('\x1b[1m', 'Spark CLI Authentication'));
    console.log('');

    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Start local callback server
    try {
      serverInfo = await startCallbackServer();
    } catch (err) {
      printError(`Failed to start callback server: ${err.message}`);
      console.log('');
      printApiKeyFallback();
      return;
    }

    const { server } = serverInfo;
    const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`;

    // Build OAuth authorization URL
    const { authorizationEndpoint } = await getOAuthEndpoints();
    const authUrl = new URL(authorizationEndpoint);
    authUrl.searchParams.set('provider', 'authkit');
    const clientId = await getClientId(redirectUri);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    console.log('Opening browser for authentication...');
    console.log('');
    console.log(`If the browser doesn't open, visit:\n${colorize('\x1b[36m', authUrl.toString())}`);
    console.log('');

    await open(authUrl.toString());

    spinner = createSpinner('Waiting for authentication...');
    const result = await waitForCallback(server, state, codeVerifier);
    spinner.stop('Browser authentication complete');

    tokenSpinner = createSpinner('Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(result.code, result.codeVerifier, redirectUri);

    const local = options.local || false;
    saveCredentials(
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
        tokenType: tokens.token_type || 'Bearer',
      },
      { local },
    );

    const location = local ? 'locally (.spark/)' : 'globally (~/.spark/)';
    tokenSpinner.stop(`Credentials saved ${location}`);
    console.log('');
    printSuccess('Successfully logged in to Spark!');
    console.log('');
    console.log(`Run ${colorize('\x1b[33m', 'spark whoami')} to see your account info.`);
  } catch (err) {
    if (serverInfo) serverInfo.server.close();
    if (tokenSpinner) {
      tokenSpinner.fail('Token exchange failed');
    } else if (spinner) {
      spinner.fail('Authentication failed');
    }
    printError(err.message);
    console.log('');
    printApiKeyFallback();
  }
}

function printApiKeyFallback() {
  console.log(`${colorize('\x1b[33m', 'Alternative:')} Use an API key instead:`);
  console.log(`  1. Visit: ${colorize('\x1b[36m', 'https://spark.memco.ai/settings/api')}`);
  console.log('  2. Generate an API key');
  console.log(`  3. Run: ${colorize('\x1b[33m', 'export SPARK_API_KEY=your_api_key')}`);
}

/**
 * Logout command handler
 */
export async function logoutCommand() {
  try {
    // Server-side logout (best-effort)
    const credentials = loadCredentials();
    if (credentials?.accessToken) {
      printInfo('Logging out of Spark server...');
      try {
        const response = await fetch(`${API_BASE}/auth/logout-all`, {
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
          redirect: 'manual',
        });

        const redirectUrl = response.headers.get('location');
        if (redirectUrl) {
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
 * Whoami command handler
 */
export async function whoamiCommand(_options, command) {
  try {
    const user = await getCurrentUser(command);
    output(user, command);
  } catch (err) {
    const apiKey = process.env.SPARK_API_KEY;
    if (apiKey) {
      output(
        {
          authenticated: true,
          method: 'environment_variable',
          message: 'Authenticated via SPARK_API_KEY, but could not fetch user info',
          error: err.message,
        },
        command,
      );
    } else if (credentialsExist()) {
      output(
        {
          authenticated: true,
          method: 'oauth',
          message: 'Credentials file exists, but could not fetch user info',
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
