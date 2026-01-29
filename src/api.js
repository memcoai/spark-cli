import { readFileSync, existsSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const API_BASE = 'https://spark.memco.ai';
const WORKOS_TOKEN_URL = 'https://api.workos.com/user_management/authenticate';
const CLIENT_ID = 'client_01K9FH88F84YY50V7RA6YW6KDF'; // TODO: Replace with CLI-specific client_id
const SPARK_DIR = join(homedir(), '.spark');
const CREDENTIALS_PATH = join(SPARK_DIR, 'credentials.json');

/**
 * Load credentials from file
 */
function loadCredentials() {
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
 * Save credentials to file
 */
function saveCredentials(credentials) {
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

/**
 * Check if token is expired (with 5 min buffer)
 */
function isTokenExpired(credentials) {
  if (!credentials?.expiresAt) {
    return false; // No expiry info, assume valid
  }
  return Date.now() >= credentials.expiresAt - 5 * 60 * 1000;
}

/**
 * Refresh the access token via WorkOS
 */
async function refreshToken(credentials) {
  if (!credentials?.refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(WORKOS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: credentials.refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  // WorkOS returns { accessToken, refreshToken, ... }
  const newCredentials = {
    ...credentials,
    accessToken: data.accessToken || data.access_token,
    refreshToken: data.refreshToken || data.refresh_token || credentials.refreshToken,
    expiresAt: (data.expiresIn || data.expires_in) ? Date.now() + (data.expiresIn || data.expires_in) * 1000 : null,
    tokenType: 'Bearer',
  };

  saveCredentials(newCredentials);
  return newCredentials;
}

/**
 * Get the API key or access token
 * Priority: CLI flag > env var > OAuth token > credentials file (legacy apiKey)
 */
export async function getAuthToken(options = {}) {
  // Check CLI option first (passed via parent command)
  if (options.apiKey) {
    return { type: 'apiKey', token: options.apiKey };
  }

  // Check environment variable
  if (process.env.SPARK_API_KEY) {
    return { type: 'apiKey', token: process.env.SPARK_API_KEY };
  }

  // Check credentials file
  let credentials = loadCredentials();
  if (credentials) {
    // OAuth token
    if (credentials.accessToken) {
      // Check if expired and refresh if needed
      if (isTokenExpired(credentials)) {
        try {
          credentials = await refreshToken(credentials);
        } catch (err) {
          // Refresh failed, token might be revoked
          throw new Error(`Session expired. Please run 'spark login' again. (${err.message})`);
        }
      }
      return { type: 'oauth', token: credentials.accessToken };
    }

    // Legacy API key in credentials file
    if (credentials.apiKey || credentials.token) {
      return { type: 'apiKey', token: credentials.apiKey || credentials.token };
    }
  }

  return null;
}

/**
 * Get the API key from environment or credentials file (sync version for backwards compat)
 * Priority: CLI flag > env var > credentials file
 */
export function getApiKey(options = {}) {
  // Check CLI option first (passed via parent command)
  if (options.apiKey) {
    return options.apiKey;
  }

  // Check environment variable
  if (process.env.SPARK_API_KEY) {
    return process.env.SPARK_API_KEY;
  }

  // Check credentials file
  if (existsSync(CREDENTIALS_PATH)) {
    try {
      const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
      return creds.accessToken || creds.apiKey || creds.token;
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Get the parent command options (for --api-key flag)
 */
function getParentOptions(command) {
  let current = command;
  while (current?.parent) {
    current = current.parent;
  }
  return current?.opts() || {};
}

/**
 * Make an API request to the Spark backend
 */
export async function apiRequest(endpoint, method = 'GET', body = null, command = null) {
  const parentOpts = command ? getParentOptions(command) : {};
  const auth = await getAuthToken({ apiKey: parentOpts.apiKey });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'spark-cli/0.1.0',
  };

  if (auth) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Call a Spark API tool (mirrors MCP tool interface)
 */
export async function callTool(toolName, params, command = null) {
  return apiRequest('/api/tools/' + toolName, 'POST', params, command);
}

/**
 * Query for recommendations
 */
export async function getRecommendation(query, environment = [], task = [], command = null) {
  return callTool('get_recommendation', { query, environment, task }, command);
}

/**
 * Get detailed insights for a task
 */
export async function getInsights(sessionId, taskIdx, command = null) {
  return callTool('get_insights', { session_id: sessionId, task_idx: taskIdx }, command);
}

/**
 * Share an insight/solution
 */
export async function shareInsight(params, command = null) {
  return callTool('share_insight', params, command);
}

/**
 * Share feedback on recommendations
 */
export async function shareFeedback(sessionId, feedback, command = null) {
  return callTool('share_feedback', { session_id: sessionId, feedback }, command);
}

/**
 * Get current user info
 */
export async function getCurrentUser(command = null) {
  return apiRequest('/api/user', 'GET', null, command);
}
