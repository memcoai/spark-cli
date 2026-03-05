import { getRecommendation } from '../api.js';
import { output, outputError } from '../output.js';
import { collectTags } from '../parse-tags.js';

/**
 * Query command handler
 */
export async function queryCommand(query, options, command) {
  try {
    const tags = collectTags(options);

    const result = await getRecommendation(query, tags, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
