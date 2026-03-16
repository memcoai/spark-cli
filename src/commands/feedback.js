import { shareFeedback } from '../api.js';
import { output, outputError } from '../output.js';
import { feedbackOptionsSchema } from '../schemas.js';

/**
 * Feedback command handler
 */
export async function feedbackCommand(sessionId, options, command) {
  try {
    const result = feedbackOptionsSchema.safeParse(options);
    if (!result.success) {
      throw new Error(result.error.issues[0].message);
    }

    const feedback = options.helpful ? 'helpful' : 'not_helpful';

    const response = await shareFeedback(sessionId, feedback, command);
    output(response, command);
  } catch (err) {
    outputError(err, command);
  }
}
