import { getRecommendation } from '../api.js';
import { output, outputError } from '../output.js';
import { parseTags, tagsToXml } from '../parse-tags.js';

/**
 * Query command handler
 */
export async function queryCommand(query, options, command) {
  try {
    const tags = tagsToXml(parseTags(options.tag));

    const result = await getRecommendation(query, tags, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
