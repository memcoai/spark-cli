import { shareFeedback } from '../api.js';
import { output, outputError } from '../output.js';
import { parseFeedbackEntries } from '../parse-tags.js';

/**
 * Feedback command handler
 */
export async function feedbackCommand(sessionId, options, command) {
  try {
    const feedback = parseFeedbackEntries(options.feedback);
    if (feedback.length === 0) {
      throw new Error('At least one --feedback entry is required');
    }

    const response = await shareFeedback(sessionId, feedback, command);
    output(response, command);
  } catch (err) {
    outputError(err, command);
  }
}
