import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const API_BASE = 'https://spark.memco.ai';
const CREDENTIALS_PATH = join(homedir(), '.spark', 'credentials.json');

/**
 * Get the API key from environment or credentials file
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
      return creds.apiKey || creds.token;
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
  while (current.parent) {
    current = current.parent;
  }
  return current.opts();
}

/**
 * Make an API request to the Spark backend
 */
export async function apiRequest(endpoint, method = 'GET', body = null, command = null) {
  const parentOpts = command ? getParentOptions(command) : {};
  const apiKey = getApiKey({ apiKey: parentOpts.apiKey });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'spark-cli/0.1.0',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
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
