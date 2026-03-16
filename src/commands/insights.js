import { getInsights } from '../api.js';
import { output, outputError } from '../output.js';
import { insightsInputSchema } from '../schemas.js';

/**
 * Insights command handler
 */
export async function insightsCommand(rawSessionId, rawTaskIndex, options, command) {
  try {
    const { sessionId, taskIndex } = insightsInputSchema.parse({
      sessionId: rawSessionId,
      taskIndex: rawTaskIndex,
    });
    const result = await getInsights(sessionId, taskIndex, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
