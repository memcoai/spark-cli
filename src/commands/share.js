import { shareInsight } from '../api.js';
import { output, outputError } from '../output.js';
import { parseTags, tagsToXml, parseSources } from '../parse-tags.js';

/**
 * Share command handler
 */
export async function shareCommand(sessionId, options, command) {
  try {
    const params = {
      title: options.title,
      content: options.content,
      session_id: sessionId,
    };
    if (options.taskIndex !== undefined) {
      params.task_idx = options.taskIndex;
    }
    if (options.tag) {
      params.tags = tagsToXml(parseTags(options.tag));
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
