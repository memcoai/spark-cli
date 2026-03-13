import { DEFAULT_API_BASE, getApiBase, SETTINGS_PATH } from './constants.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';
import {
  protectedResourceSchema,
  authorizationServerSchema,
  clientRegistrationResponseSchema,
} from './schemas.js';

const PROTECTED_RESOURCE_WELL_KNOWN = '/.well-known/oauth-protected-resource';
const AUTHORIZATION_SERVER_WELL_KNOWN = '/.well-known/oauth-authorization-server';

const oauthMetadataCache = new Map();

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

async function resolveOAuthMetadata(apiBase) {
  const protectedUrl = `${apiBase}${PROTECTED_RESOURCE_WELL_KNOWN}`;
  const protectedMetadata = protectedResourceSchema.parse(await fetchJson(protectedUrl));

  const servers = protectedMetadata.authorization_servers;
  let issuerBase = apiBase;

  if (Array.isArray(servers) && servers.length > 0) {
    const firstServer = servers[0];
    if (typeof firstServer === 'string') {
      issuerBase = normalizeBaseUrl(firstServer) || issuerBase;
    }
  }

  const authorizationMetadata = authorizationServerSchema.parse(
    await fetchJson(`${issuerBase}${AUTHORIZATION_SERVER_WELL_KNOWN}`),
  );

  return { protectedMetadata, authorizationMetadata };
}

async function getOAuthMetadata(apiBase) {
  const base = normalizeBaseUrl(apiBase) || getApiBase();
  if (!oauthMetadataCache.has(base)) {
    oauthMetadataCache.set(base, resolveOAuthMetadata(base));
  }
  return oauthMetadataCache.get(base);
}

export async function getOAuthEndpoints(apiBase) {
  const { authorizationMetadata } = await getOAuthMetadata(apiBase);
  return {
    authorizationEndpoint: authorizationMetadata.authorizationEndpoint,
    tokenEndpoint: authorizationMetadata.tokenEndpoint,
    bearerMethods: authorizationMetadata.bearerMethodsSupported || null,
  };
}

export async function getBearerMethods(apiBase) {
  const { protectedMetadata, authorizationMetadata } = await getOAuthMetadata(apiBase);
  return (
    protectedMetadata.bearer_methods_supported ||
    authorizationMetadata.bearerMethodsSupported ||
    null
  );
}

/**
 * Migrate old flat `client` key to per-URL `clients` format.
 */
function migrateClient() {
  const oldClient = readSettingsKey(SETTINGS_PATH, 'client');
  if (oldClient?.client_id) {
    const clients = readSettingsKey(SETTINGS_PATH, 'clients') || {};
    if (!clients[DEFAULT_API_BASE]) {
      clients[DEFAULT_API_BASE] = oldClient;
      writeSettingsKey(SETTINGS_PATH, 'clients', clients);
    }
    writeSettingsKey(SETTINGS_PATH, 'client', null);
    return clients;
  }
  return null;
}

function loadClient(apiBase) {
  const base = normalizeBaseUrl(apiBase) || getApiBase();
  let clients = readSettingsKey(SETTINGS_PATH, 'clients');
  if (!clients) {
    clients = migrateClient();
  }
  return clients?.[base] || null;
}

function saveClient(client, apiBase) {
  const base = normalizeBaseUrl(apiBase) || getApiBase();
  const clients = readSettingsKey(SETTINGS_PATH, 'clients') || {};
  clients[base] = client;
  writeSettingsKey(SETTINGS_PATH, 'clients', clients);
}

async function registerClient(redirectUri, apiBase) {
  if (!redirectUri) {
    throw new Error('OAuth client registration requires a redirect URI');
  }

  const { authorizationMetadata } = await getOAuthMetadata(apiBase);
  const registrationEndpoint = authorizationMetadata.registrationEndpoint;

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

  return clientRegistrationResponseSchema.parse(await response.json());
}

export async function getClientId(redirectUri = null, apiBase = null) {
  if (process.env.SPARK_CLIENT_ID) {
    return process.env.SPARK_CLIENT_ID;
  }
  if (!apiBase) {
    apiBase = getApiBase();
  }

  const cached = loadClient(apiBase);
  if (cached?.client_id) {
    return cached.client_id;
  }

  const client = await registerClient(redirectUri, apiBase);
  saveClient(client, apiBase);
  return client.client_id;
}
