import { shareTask } from '../api.js';
import { output, outputError } from '../output.js';
import { collectTags } from '../parse-tags.js';
import { shareTaskInputSchema } from '../schemas.js';

/**
 * Share-task command handler
 */
export async function shareTaskCommand(rawQuery, options, command) {
  try {
    const input = shareTaskInputSchema.parse({
      query: rawQuery,
      title: options.title,
      content: options.content,
    });

    const params = {
      query: input.query,
      title: input.title,
      content: input.content,
    };

    const tags = collectTags(options);
    if (tags.length > 0) {
      params.tags = tags;
    }

    const result = await shareTask(params, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
