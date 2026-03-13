import { getRecommendation } from '../api.js';
import { output, outputError } from '../output.js';
import { collectTags } from '../parse-tags.js';
import { queryInputSchema } from '../schemas.js';

/**
 * Query command handler
 */
export async function queryCommand(rawQuery, options, command) {
  try {
    const parsed = queryInputSchema.safeParse({ query: rawQuery });
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      throw new Error(firstIssue?.message ?? 'Invalid query input.');
    }
    const { query } = parsed.data;
    const tags = collectTags(options);

    const result = await getRecommendation(query, tags, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
