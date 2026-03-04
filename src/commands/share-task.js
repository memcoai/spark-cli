import { shareTask } from '../api.js';
import { output, outputError } from '../output.js';
import { parseTags, tagsToXml } from '../parse-tags.js';

/**
 * Share-task command handler
 */
export async function shareTaskCommand(query, options, command) {
  try {
    const params = {
      query,
      insights: options.insight,
    };

    if (options.tag) {
      params.tags = tagsToXml(parseTags(options.tag));
    }

    const result = await shareTask(params, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
