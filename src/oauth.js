import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { API_BASE, SPARK_DIR, CLIENT_PATH } from './constants.js';

const PROTECTED_RESOURCE_WELL_KNOWN = '/.well-known/oauth-protected-resource';
const AUTHORIZATION_SERVER_WELL_KNOWN = '/.well-known/oauth-authorization-server';

let oauthMetadataPromise = null;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OAuth discovery failed (${response.status}): ${error}`);
  }
  return response.json();
}

function normalizeBaseUrl(url) {
  if (typeof url !== 'string') {
    return null;
  }
  return url.replace(/\/+$/, '');
}

async function resolveOAuthMetadata() {
  const protectedUrl = `${API_BASE}${PROTECTED_RESOURCE_WELL_KNOWN}`;
  const protectedMetadata = await fetchJson(protectedUrl);

  const servers = protectedMetadata.authorization_servers;
  let issuerBase = API_BASE;

  if (Array.isArray(servers) && servers.length > 0) {
    const firstServer = servers[0];
    if (typeof firstServer === 'string') {
      issuerBase = normalizeBaseUrl(firstServer) || issuerBase;
    }
  }

  const authorizationMetadata = await fetchJson(
    `${issuerBase}${AUTHORIZATION_SERVER_WELL_KNOWN}`
  );

  return { protectedMetadata, authorizationMetadata };
}

async function getOAuthMetadata() {
  if (!oauthMetadataPromise) {
    oauthMetadataPromise = resolveOAuthMetadata();
  }
  return oauthMetadataPromise;
}

export async function getOAuthEndpoints() {
  const { authorizationMetadata } = await getOAuthMetadata();
  const authorizationEndpoint =
    authorizationMetadata.authorization_endpoint || authorizationMetadata.authorizationEndpoint;
  const tokenEndpoint =
    authorizationMetadata.token_endpoint || authorizationMetadata.tokenEndpoint;

  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error('OAuth discovery missing authorization_endpoint or token_endpoint');
  }

  const bearerMethods = authorizationMetadata.bearer_methods_supported || null;

  return { authorizationEndpoint, tokenEndpoint, bearerMethods };
}

export async function getBearerMethods() {
  const { protectedMetadata, authorizationMetadata } = await getOAuthMetadata();
  return protectedMetadata.bearer_methods_supported
    || authorizationMetadata.bearer_methods_supported
    || null;
}

function loadClient() {
  if (!existsSync(CLIENT_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(CLIENT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveClient(client) {
  if (!existsSync(SPARK_DIR)) {
    mkdirSync(SPARK_DIR, { recursive: true });
  }
  writeFileSync(CLIENT_PATH, JSON.stringify(client, null, 2), { mode: 0o600 });
}

async function registerClient(redirectUri) {
  if (!redirectUri) {
    throw new Error('OAuth client registration requires a redirect URI');
  }

  const { authorizationMetadata } = await getOAuthMetadata();
  const registrationEndpoint = authorizationMetadata.registration_endpoint
    || authorizationMetadata.registrationEndpoint;

  if (!registrationEndpoint) {
    throw new Error('OAuth server does not support dynamic client registration');
  }

  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'spark-cli',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OAuth client registration failed (${response.status}): ${error}`);
  }

  return response.json();
}

export async function getClientId(redirectUri = null) {
  if (process.env.SPARK_CLIENT_ID) {
    return process.env.SPARK_CLIENT_ID;
  }

  const cached = loadClient();
  if (cached?.client_id) {
    return cached.client_id;
  }

  const client = await registerClient(redirectUri);
  saveClient(client);
  return client.client_id;
}

export { API_BASE };
