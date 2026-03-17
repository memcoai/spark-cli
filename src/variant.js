import { getCurrentUser } from './api.js';
import { VARIANTS, getVariant } from './constants.js';

/**
 * Detect the variant (public or teams) by fetching the current user.
 * Returns VARIANTS.public if unauthenticated or on any error.
 */
export async function detectVariant({ getUser = getCurrentUser } = {}) {
  try {
    const data = await getUser();
    const user = data.user || data;
    return getVariant(user);
  } catch {
    return VARIANTS.public;
  }
}
