import { DEFAULT_API_BASE, getApiBase, normalizeApiBase, SETTINGS_PATH } from './constants.js';
import { readSettingsKey, writeSettingsKey } from './settings.js';

/**
 * Per-URL OAuth client (RFC 7591 dynamic-client-registration) storage helpers.
 *
 * Discovery, dynamic client registration, PKCE, and token exchange are now all
 * handled by the MCP SDK's `auth()` orchestrator (driven through
 * `SparkOAuthProvider` in `oauth-provider.js`). This module keeps ONLY the
 * settings.json-backed client-info storage that the provider's
 * `clientInformation()` / `saveClientInformation()` methods read and write.
 */

/**
 * Migrate the old flat `client` key to the per-URL `clients` format.
 * Returns the (possibly migrated) `clients` map, or null when there was nothing
 * to migrate.
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

/**
 * Load the stored OAuth client registration for an API base URL.
 * @param {string} [apiBase]
 * @returns {object|null} the client info (`{ client_id, ... }`) or null.
 */
export function loadClient(apiBase) {
  const base = normalizeApiBase(apiBase) || getApiBase();
  let clients = readSettingsKey(SETTINGS_PATH, 'clients');
  if (!clients) {
    clients = migrateClient();
  }
  return clients?.[base] || null;
}

/**
 * Persist an OAuth client registration for an API base URL.
 * @param {object} client - the client info to store (`{ client_id, ... }`).
 * @param {string} [apiBase]
 */
export function saveClient(client, apiBase) {
  const base = normalizeApiBase(apiBase) || getApiBase();
  const clients = readSettingsKey(SETTINGS_PATH, 'clients') || {};
  clients[base] = client;
  writeSettingsKey(SETTINGS_PATH, 'clients', clients);
}
