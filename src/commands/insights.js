import { getInsights } from '../api.js';
import { output, outputError } from '../output.js';

/**
 * Insights command handler
 */
export async function insightsCommand(sessionId, taskIndex, options, command) {
  try {
    if (!/^\d+$/.test(String(taskIndex))) {
      throw new Error('task-index must be a non-negative integer');
    }

    const result = await getInsights(sessionId, String(taskIndex), command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
