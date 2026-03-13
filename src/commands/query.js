import { getRecommendation } from '../api.js';
import { output, outputError } from '../output.js';
import { collectTags } from '../parse-tags.js';
import { queryInputSchema } from '../schemas.js';

/**
 * Query command handler
 */
export async function queryCommand(rawQuery, options, command) {
  try {
    const { query } = queryInputSchema.parse({ query: rawQuery });
    const tags = collectTags(options);

    const result = await getRecommendation(query, tags, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
