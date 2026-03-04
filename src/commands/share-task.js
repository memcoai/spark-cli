import { shareTask } from '../api.js';
import { output, outputError } from '../output.js';
import { collectTags } from '../parse-tags.js';

/**
 * Share-task command handler
 */
export async function shareTaskCommand(query, options, command) {
  try {
    const params = {
      query,
      insights: options.insight,
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
