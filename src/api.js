import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getApiBase, CALLBACK_PORT } from './constants.js';
import { loadCredentials, saveCredentials, isTokenExpired } from './credentials.js';
import { getOAuthEndpoints, getBearerMethods, getClientId } from './oauth.js';
import { getParentOptions } from './output.js';
import { tokenResponseSchema, toolResponseSchema } from './schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

/**
 * Refresh the access token using the refresh token
 */
export async function refreshToken(credentials, apiBase, local) {
  if (!credentials?.refreshToken) {
    throw new Error('No refresh token available');
  }

  const { tokenEndpoint } = await getOAuthEndpoints(apiBase);
  const clientId = await getClientId(`http://localhost:${CALLBACK_PORT}/callback`, apiBase);
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
  const parsed = tokenResponseSchema.parse(data);

  const newCredentials = {
    ...credentials,
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken || credentials.refreshToken,
    expiresAt: parsed.expiresIn ? Date.now() + parsed.expiresIn * 1000 : null,
    tokenType: 'Bearer',
  };

  saveCredentials(newCredentials, { local, apiBase });
  return newCredentials;
}

/**
 * Get the auth token.
 * Priority: CLI flag > env var > OAuth token > credentials file (legacy apiKey)
 */
export async function getAuthToken(apiBase, options = {}) {
  if (options.apiKey) {
    return { type: 'apiKey', token: options.apiKey };
  }

  if (process.env.SPARK_API_KEY) {
    return { type: 'apiKey', token: process.env.SPARK_API_KEY };
  }

  const loaded = loadCredentials(apiBase, { withSource: true });
  if (loaded.credentials) {
    let { credentials } = loaded;
    if (credentials.accessToken) {
      if (isTokenExpired(credentials)) {
        try {
          credentials = await refreshToken(credentials, apiBase, loaded.local);
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
 * Apply auth to request headers/endpoint.
 * Returns the (possibly modified) endpoint.
 */
export async function applyAuth(auth, headers, base, endpoint, deps = {}) {
  const { bearerMethods: getBM = getBearerMethods } = deps;

  if (!auth) return endpoint;

  if (auth.type === 'oauth') {
    const methods = await getBM(base);
    const supported = new Set(methods || ['header', 'authorization_header']);

    if (supported.has('header') || supported.has('authorization_header')) {
      headers['Authorization'] = `Bearer ${auth.token}`;
    } else if (supported.has('query')) {
      const requestUrl = new URL(`${base}${endpoint}`);
      requestUrl.searchParams.set('access_token', auth.token);
      return `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`;
    } else {
      throw new Error('OAuth bearer method not supported by server');
    }
  } else {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  return endpoint;
}

/**
 * Attempt token refresh and retry the request on 401.
 * Returns the retried response, or throws if refresh fails.
 */
export async function retryWithRefresh(base, endpoint, options, deps = {}) {
  const { loadCreds = loadCredentials, refresh = refreshToken, doFetch = fetch } = deps;

  const loaded = loadCreds(base, { withSource: true });
  try {
    const newCredentials = await refresh(loaded.credentials, base, loaded.local);
    const auth = { type: 'oauth', token: newCredentials.accessToken };
    // Clear stale Authorization header before re-applying auth
    delete options.headers['Authorization'];
    const retryEndpoint = await applyAuth(auth, options.headers, base, endpoint, deps);
    return await doFetch(`${base}${retryEndpoint}`, options);
  } catch {
    throw new Error("Session expired. Please run 'spark login' again.");
  }
}

/**
 * Make an API request to the Spark backend
 */
export async function apiRequest(
  endpoint,
  apiBase,
  method = 'GET',
  body = null,
  command = null,
  deps = {},
) {
  const { getAuth = getAuthToken, doFetch = fetch, schema = toolResponseSchema } = deps;

  const base = (typeof apiBase === 'string' ? apiBase.replace(/\/+$/, '') : null) || getApiBase();
  const parentOpts = command ? getParentOptions(command) : {};
  const auth = await getAuth(base, { apiKey: parentOpts.apiKey });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': `spark-cli/${pkg.version}`,
    'X-CLI-VERSION': pkg.version,
  };

  const requestEndpoint = await applyAuth(auth, headers, base, endpoint, deps);

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const url = `${base}${requestEndpoint}`;
  let response = await doFetch(url, options);

  if (response.status === 401 && auth?.type === 'oauth') {
    response = await retryWithRefresh(base, endpoint, options, deps);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  const json = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path && issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    throw new Error(
      `API response validation failed for ${method} ${url} (${response.status}): ${issues}`,
    );
  }
  return result.data;
}

/**
 * Call a Spark API tool (mirrors MCP tool interface)
 */
export async function callTool(toolName, params, command = null) {
  return apiRequest(`/api/internal/v1/tools/${toolName}`, undefined, 'POST', params, command);
}

/**
 * Query for recommendations
 */
export async function getRecommendation(query, tags = [], command = null) {
  return callTool('get_recommendation', { query, tags }, command);
}

/**
 * Share an insight/solution
 */
export async function shareInsight(params, command = null) {
  return callTool('share_insight', params, command);
}

/**
 * Share a task with insights
 */
export async function shareTask(params, command = null) {
  return callTool('share_task', params, command);
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
export async function getCurrentUser(apiBase, command = null) {
  return apiRequest('/api/internal/v1/user', apiBase, 'GET', null, command);
}
