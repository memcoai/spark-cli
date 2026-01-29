import { getInsights } from '../api.js';
import { output, outputError } from '../output.js';

/**
 * Insights command handler
 */
export async function insightsCommand(sessionId, taskIndex, options, command) {
  try {
    const taskIdx = parseInt(taskIndex, 10);

    if (isNaN(taskIdx) || taskIdx < 0) {
      throw new Error('task-index must be a non-negative integer');
    }

    const result = await getInsights(sessionId, taskIdx, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
