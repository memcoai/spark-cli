import { getRecommendation } from '../api.js';
import { output, outputError } from '../output.js';

/**
 * Parse environment tags from comma-separated string
 * Supports formats: "node:20" or "language_version:node:20"
 */
function parseEnvTags(envString) {
  if (!envString) return [];

  return envString.split(',').map(tag => {
    const trimmed = tag.trim();
    // If already has full format (category:name:version), return as-is
    if (trimmed.split(':').length >= 3) {
      return trimmed;
    }
    // Otherwise assume it's name:version format, prefix with common categories
    const [name, version] = trimmed.split(':');
    if (version) {
      // Try to guess the category
      const langNames = ['node', 'python', 'ruby', 'java', 'go', 'rust', 'php'];
      const frameworks = ['react', 'vue', 'angular', 'django', 'flask', 'rails', 'express', 'nextjs', 'nuxt'];

      if (langNames.includes(name.toLowerCase())) {
        return `language_version:${name}:${version}`;
      } else if (frameworks.includes(name.toLowerCase())) {
        return `framework_version:${name}:${version}`;
      } else {
        return `library_version:${name}:${version}`;
      }
    }
    // Just a name, could be platform
    const platforms = ['macos', 'linux', 'windows', 'docker', 'kubernetes'];
    if (platforms.includes(trimmed.toLowerCase())) {
      if (['docker', 'kubernetes'].includes(trimmed.toLowerCase())) {
        return `runtime:${trimmed}`;
      }
      return `platform:${trimmed}`;
    }
    return trimmed;
  });
}

/**
 * Parse task tags from comma-separated string
 */
function parseTaskTags(tagsString) {
  if (!tagsString) return [];

  return tagsString.split(',').map(tag => {
    const trimmed = tag.trim();
    // If already has format (category:value), return as-is
    if (trimmed.includes(':')) {
      return trimmed;
    }
    // Try to guess the category
    const errorTypes = ['TypeError', 'ImportError', 'SyntaxError', 'RuntimeError', 'ValueError', 'KeyError', 'AttributeError'];
    const taskTypes = ['bug_fix', 'implementation', 'optimization', 'discovery', 'refactoring'];
    const domains = ['web', 'data', 'ml', 'devops', 'mobile', 'backend', 'frontend'];

    if (errorTypes.some(e => trimmed.toLowerCase().includes(e.toLowerCase()))) {
      return `error-type:${trimmed}`;
    } else if (taskTypes.includes(trimmed.toLowerCase())) {
      return `task-type:${trimmed}`;
    } else if (domains.includes(trimmed.toLowerCase())) {
      return `domain:${trimmed}`;
    }
    // Default to just the tag
    return trimmed;
  });
}

/**
 * Query command handler
 */
export async function queryCommand(error, options, command) {
  try {
    const environment = parseEnvTags(options.env);
    const task = parseTaskTags(options.tags);

    const result = await getRecommendation(error, environment, task, command);
    output(result, command);
  } catch (err) {
    outputError(err, command);
  }
}
