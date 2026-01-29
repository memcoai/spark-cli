import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createServer } from 'http';
import { randomBytes, createHash } from 'crypto';
import { URL } from 'url';
import open from 'open';
import { getCurrentUser } from '../api.js';
import { output, outputError, outputSuccess } from '../output.js';
import { printBanner, printSuccess, printError, printInfo, createSpinner } from '../banner.js';

const SPARK_DIR = join(homedir(), '.spark');
const CREDENTIALS_PATH = join(SPARK_DIR, 'credentials.json');
const WORKOS_AUTH_URL = 'https://api.workos.com/user_management/authorize';
const WORKOS_TOKEN_URL = 'https://api.workos.com/user_management/authenticate';
const API_BASE = 'https://spark.memco.ai';
const CLIENT_ID = 'client_01K9FH88F84YY50V7RA6YW6KDF'; // TODO: Replace with CLI-specific client_id
const CALLBACK_PORT = 8789;

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
 * Start local server to receive OAuth callback
 */
function startCallbackServer(expectedState, codeVerifier) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Authentication Failed</h1>
                <p>${errorDescription || error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(errorDescription || error));
          return;
        }

        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Authentication Failed</h1>
                <p>Invalid state parameter. This could be a CSRF attack.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('Invalid state parameter'));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Authentication Failed</h1>
                <p>No authorization code received.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        // Success response
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>Authentication Successful</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);

        server.close();
        resolve({ code, codeVerifier });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${CALLBACK_PORT} is already in use. Please close any other applications using this port.`));
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
 * Exchange authorization code for tokens via WorkOS
 */
async function exchangeCodeForTokens(code, codeVerifier) {
  const response = await fetch(WORKOS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  // WorkOS returns { user, accessToken, refreshToken, ... }
  return {
    access_token: data.accessToken || data.access_token,
    refresh_token: data.refreshToken || data.refresh_token,
    expires_in: data.expiresIn || data.expires_in,
    token_type: 'Bearer',
    user: data.user,
  };
}

/**
 * Refresh access token using refresh token via WorkOS
 */
export async function refreshAccessToken(refreshToken) {
  const response = await fetch(WORKOS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
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
export async function loginCommand(options, command) {
  try {
    // Show the banner
    printBanner();
    console.log('');

    // Check if already authenticated
    if (existsSync(CREDENTIALS_PATH)) {
      try {
        const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
        if (creds.accessToken || creds.apiKey) {
          printInfo('You are already logged in.');
          console.log('');
          console.log('Run \x1b[33mspark logout\x1b[0m first to log out, then try again.');
          console.log('Or run \x1b[33mspark whoami\x1b[0m to see your account info.');
          return;
        }
      } catch {
        // Credentials file exists but is invalid, continue with login
      }
    }

    // Check for API key in environment
    if (process.env.SPARK_API_KEY) {
      printInfo('You are authenticated via SPARK_API_KEY environment variable.');
      console.log('');
      console.log('To use OAuth instead, unset the environment variable:');
      console.log('  \x1b[33munset SPARK_API_KEY\x1b[0m');
      return;
    }

    console.log('\x1b[1mSpark CLI Authentication\x1b[0m');
    console.log('');

    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Start local callback server
    let serverInfo;
    try {
      serverInfo = await startCallbackServer(state, codeVerifier);
    } catch (err) {
      printError(`Failed to start callback server: ${err.message}`);
      console.log('');
      console.log('\x1b[33mAlternative:\x1b[0m Use an API key instead:');
      console.log('  1. Visit: \x1b[36mhttps://spark.memco.ai/settings/api\x1b[0m');
      console.log('  2. Generate an API key');
      console.log('  3. Run: \x1b[33mexport SPARK_API_KEY=your_api_key\x1b[0m');
      return;
    }

    // If we got a server back, we need to wait for the callback
    if (serverInfo.server) {
      const { server } = serverInfo;

      // Build WorkOS authorization URL
      const authUrl = new URL(WORKOS_AUTH_URL);
      authUrl.searchParams.set('client_id', CLIENT_ID);
      authUrl.searchParams.set('provider', 'authkit');
      authUrl.searchParams.set('redirect_uri', `http://localhost:${CALLBACK_PORT}/callback`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);

      console.log('Opening browser for authentication...');
      console.log('');
      console.log(`If the browser doesn't open, visit:\n\x1b[36m${authUrl.toString()}\x1b[0m`);
      console.log('');

      // Open browser
      await open(authUrl.toString());

      const spinner = createSpinner('Waiting for authentication...');

      // Wait for callback
      try {
        const result = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            server.close();
            reject(new Error('Authentication timed out after 5 minutes'));
          }, 5 * 60 * 1000);

          // Replace the server's request handler to capture the result
          server.removeAllListeners('request');
          server.on('request', async (req, res) => {
            const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);

            if (url.pathname === '/callback') {
              clearTimeout(timeout);

              const code = url.searchParams.get('code');
              const returnedState = url.searchParams.get('state');
              const error = url.searchParams.get('error');
              const errorDescription = url.searchParams.get('error_description');

              if (error) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`
                  <html>
                    <body style="font-family: system-ui; padding: 40px; text-align: center;">
                      <h1>Authentication Failed</h1>
                      <p>${errorDescription || error}</p>
                      <p>You can close this window.</p>
                    </body>
                  </html>
                `);
                server.close();
                reject(new Error(errorDescription || error));
                return;
              }

              if (returnedState !== state) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`
                  <html>
                    <body style="font-family: system-ui; padding: 40px; text-align: center;">
                      <h1>Authentication Failed</h1>
                      <p>Security validation failed. Please try again.</p>
                      <p>You can close this window.</p>
                    </body>
                  </html>
                `);
                server.close();
                reject(new Error('Invalid state parameter'));
                return;
              }

              if (!code) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`
                  <html>
                    <body style="font-family: system-ui; padding: 40px; text-align: center;">
                      <h1>Authentication Failed</h1>
                      <p>No authorization code received.</p>
                      <p>You can close this window.</p>
                    </body>
                  </html>
                `);
                server.close();
                reject(new Error('No authorization code received'));
                return;
              }

              // Success
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: system-ui; padding: 40px; text-align: center;">
                    <h1>Authentication Successful</h1>
                    <p>You can close this window and return to the terminal.</p>
                  </body>
                </html>
              `);

              server.close();
              resolve({ code, codeVerifier });
            } else {
              res.writeHead(404);
              res.end('Not found');
            }
          });
        });

        spinner.stop('Browser authentication complete');

        // Exchange code for tokens
        const tokenSpinner = createSpinner('Exchanging code for tokens...');

        try {
          const tokens = await exchangeCodeForTokens(result.code, result.codeVerifier);

          // Save credentials
          saveCredentials({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
            tokenType: tokens.token_type || 'Bearer',
          });

          tokenSpinner.stop('Credentials saved');
          console.log('');
          printSuccess('Successfully logged in to Spark!');
          console.log('');
          console.log('Run \x1b[33mspark whoami\x1b[0m to see your account info.');

        } catch (tokenErr) {
          tokenSpinner.fail('Token exchange failed');
          throw tokenErr;
        }

      } catch (authErr) {
        spinner.fail('Authentication failed');
        throw authErr;
      }

    }

  } catch (err) {
    printError(err.message);
    console.log('');
    console.log('\x1b[33mAlternative:\x1b[0m Use an API key instead:');
    console.log('  1. Visit: \x1b[36mhttps://spark.memco.ai/settings/api\x1b[0m');
    console.log('  2. Generate an API key');
    console.log('  3. Run: \x1b[33mexport SPARK_API_KEY=your_api_key\x1b[0m');
  }
}

/**
 * Logout command handler
 */
export async function logoutCommand(options, command) {
  try {
    if (existsSync(CREDENTIALS_PATH)) {
      unlinkSync(CREDENTIALS_PATH);
      outputSuccess('Logged out successfully. Credentials removed.', {}, command);
    } else {
      output({
        success: true,
        message: 'No credentials file found. You may still be authenticated via SPARK_API_KEY environment variable.',
      }, command);
    }
  } catch (err) {
    outputError(err, command);
  }
}

/**
 * Whoami command handler
 */
export async function whoamiCommand(options, command) {
  try {
    const user = await getCurrentUser(command);
    output(user, command);
  } catch (err) {
    // If we get an error, check what auth method is being used
    const apiKey = process.env.SPARK_API_KEY;
    if (apiKey) {
      output({
        authenticated: true,
        method: 'environment_variable',
        message: 'Authenticated via SPARK_API_KEY, but could not fetch user info',
        error: err.message,
      }, command);
    } else if (existsSync(CREDENTIALS_PATH)) {
      output({
        authenticated: true,
        method: 'oauth',
        message: 'Credentials file exists, but could not fetch user info',
        error: err.message,
      }, command);
    } else {
      output({
        authenticated: false,
        message: 'Not authenticated. Run `spark login` to authenticate.',
      }, command);
    }
  }
}

/**
 * Save credentials to file
 */
export function saveCredentials(credentials) {
  if (!existsSync(SPARK_DIR)) {
    mkdirSync(SPARK_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

/**
 * Load credentials from file
 */
export function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Check if token is expired (with 5 min buffer)
 */
export function isTokenExpired(credentials) {
  if (!credentials?.expiresAt) {
    return false; // No expiry info, assume valid
  }
  return Date.now() >= credentials.expiresAt - 5 * 60 * 1000;
}
