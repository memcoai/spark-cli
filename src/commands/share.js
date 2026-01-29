import { shareInsight } from '../api.js';
import { output, outputError } from '../output.js';

/**
 * Parse environment tags from comma-separated string
 */
function parseEnvTags(envString) {
  if (!envString) return [];
  return envString.split(',').map(tag => tag.trim()).filter(Boolean);
}

/**
 * Parse task tags from comma-separated string
 */
function parseTaskTags(tagsString) {
  if (!tagsString) return [];
  return tagsString.split(',').map(tag => tag.trim()).filter(Boolean);
}

/**
 * Parse source URLs from comma-separated string
 */
function parseSources(sourcesString) {
  if (!sourcesString) return [];
  return sourcesString.split(',').map(url => url.trim()).filter(Boolean);
}

/**
 * Share command handler
 */
export async function shareCommand(options, command) {
  try {
    const params = {
      title: options.title,
      content: options.content,
    };

    // Optional parameters
    if (options.session) {
      params.session_id = options.session;
    }
    if (options.taskIndex !== undefined) {
      params.task_idx = parseInt(options.taskIndex, 10);
    }
    if (options.env) {
      params.environment = parseEnvTags(options.env);
    }
    if (options.tags) {
      params.task = parseTaskTags(options.tags);
    }
    if (options.sources) {
      params.sources = parseSources(options.sources);
    }

    const result = await shareInsight(params, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
