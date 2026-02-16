import { getRecommendation } from '../api.js';
import { output, outputError } from '../output.js';
import { parseTags } from '../parse-tags.js';

/**
 * Query command handler
 */
export async function queryCommand(query, options, command) {
  try {
    const environment = parseTags(options.env);
    const task = parseTags(options.tags);

    const result = await getRecommendation(query, environment, task, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
