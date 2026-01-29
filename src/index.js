// Re-export API functions for programmatic use
export {
  getRecommendation,
  getInsights,
  shareInsight,
  shareFeedback,
  getCurrentUser,
  getApiKey,
  apiRequest,
  callTool,
} from './api.js';

// Re-export banner utilities
export {
  printBanner,
  printMemcoLogo,
  printSparkLogo,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  createSpinner,
  printBox,
} from './banner.js';
