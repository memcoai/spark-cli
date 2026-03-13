import { shareInsight } from '../api.js';
import { output, outputError } from '../output.js';
import { collectTags, parseSources } from '../parse-tags.js';
import { shareInputSchema } from '../schemas.js';

/**
 * Share command handler
 */
export async function shareCommand(rawSessionId, options, command) {
  try {
    const input = shareInputSchema.parse({
      sessionId: rawSessionId,
      title: options.title,
      content: options.content,
      taskIndex: options.taskIndex,
      sources: options.sources,
    });

    const params = {
      title: input.title,
      content: input.content,
      session_id: input.sessionId,
    };
    if (input.taskIndex !== undefined) {
      params.task_idx = input.taskIndex;
    }
    const tags = collectTags(options);
    if (tags.length > 0) {
      params.tags = tags;
    }
    if (input.sources) {
      params.sources = parseSources(input.sources);
    }

    const result = await shareInsight(params, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
