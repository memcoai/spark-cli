import { shareInsight } from '../api.js';
import { output, outputError } from '../output.js';
import { parseTags, parseSources } from '../parse-tags.js';

/**
 * Share command handler
 */
export async function shareCommand(options, command) {
  try {
    const params = {
      title: options.title,
      content: options.content,
    };

    if (options.session) {
      params.session_id = options.session;
    }
    if (options.taskIndex !== undefined) {
      params.task_idx = parseInt(options.taskIndex, 10);
    }
    if (options.env) {
      params.environment = parseTags(options.env);
    }
    if (options.tags) {
      params.task = parseTags(options.tags);
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
