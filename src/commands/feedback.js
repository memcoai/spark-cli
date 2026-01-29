import { shareFeedback } from '../api.js';
import { output, outputError } from '../output.js';

/**
 * Feedback command handler
 */
export async function feedbackCommand(sessionId, options, command) {
  try {
    // Determine feedback value
    let feedback;
    if (options.helpful) {
      feedback = 'helpful';
    } else if (options.notHelpful) {
      feedback = 'not_helpful';
    } else {
      throw new Error('Must specify either --helpful or --not-helpful');
    }

    const result = await shareFeedback(sessionId, feedback, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
