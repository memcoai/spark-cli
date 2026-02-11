import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { API_BASE } from './constants.js';
import { loadCredentials, saveCredentials, isTokenExpired } from './credentials.js';
import { getOAuthEndpoints, getBearerMethods, getClientId } from './oauth.js';
import { getParentOptions } from './output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

/**
 * Refresh the access token using the refresh token
 */
async function refreshToken(credentials) {
  if (!credentials?.refreshToken) {
    throw new Error('No refresh token available');
  }

  const { tokenEndpoint } = await getOAuthEndpoints();
  const clientId = await getClientId();
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: credentials.refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  const newCredentials = {
    ...credentials,
    accessToken: data.accessToken || data.access_token,
    refreshToken: data.refreshToken || data.refresh_token || credentials.refreshToken,
    expiresAt:
      data.expiresIn || data.expires_in
        ? Date.now() + (data.expiresIn || data.expires_in) * 1000
        : null,
    tokenType: 'Bearer',
  };

  saveCredentials(newCredentials);
  return newCredentials;
}

/**
 * Get the auth token.
 * Priority: CLI flag > env var > OAuth token > credentials file (legacy apiKey)
 */
export async function getAuthToken(options = {}) {
  if (options.apiKey) {
    return { type: 'apiKey', token: options.apiKey };
  }

  if (process.env.SPARK_API_KEY) {
    return { type: 'apiKey', token: process.env.SPARK_API_KEY };
  }

  let credentials = loadCredentials();
  if (credentials) {
    if (credentials.accessToken) {
      if (isTokenExpired(credentials)) {
        try {
          credentials = await refreshToken(credentials);
        } catch (err) {
          throw new Error(`Session expired. Please run 'spark login' again. (${err.message})`);
        }
      }
      return { type: 'oauth', token: credentials.accessToken };
    }

    if (credentials.apiKey || credentials.token) {
      return { type: 'apiKey', token: credentials.apiKey || credentials.token };
    }
  }

  return null;
}

/**
 * Make an API request to the Spark backend
 */
export async function apiRequest(endpoint, method = 'GET', body = null, command = null) {
  let requestEndpoint = endpoint;
  const parentOpts = command ? getParentOptions(command) : {};
  const auth = await getAuthToken({ apiKey: parentOpts.apiKey });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': `spark-cli/${pkg.version}`,
  };

  if (auth) {
    if (auth.type === 'oauth') {
      const bearerMethods = await getBearerMethods();
      const supported = new Set(bearerMethods || ['header', 'authorization_header']);

      if (supported.has('header') || supported.has('authorization_header')) {
        headers['Authorization'] = `Bearer ${auth.token}`;
      } else if (supported.has('query')) {
        const requestUrl = new URL(`${API_BASE}${requestEndpoint}`);
        requestUrl.searchParams.set('access_token', auth.token);
        requestEndpoint = `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;
      } else {
        throw new Error('OAuth bearer method not supported by server');
      }
    } else {
      headers['Authorization'] = `Bearer ${auth.token}`;
    }
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${requestEndpoint}`, options);

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
  return apiRequest(`/api/internal/v1/tools/${toolName}`, 'POST', params, command);
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
  return callTool('get_insights', { session_id: sessionId, task_idx: String(taskIdx) }, command);
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
  return apiRequest('/api/internal/v1/user', 'GET', null, command);
}
