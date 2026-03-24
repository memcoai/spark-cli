import { z } from 'zod';

// ──────────────────────────────────────────────
// Shared primitives
// ──────────────────────────────────────────────

const nonEmptyString = z.string().min(1);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Normalize a version string.
 * Strips leading 'v'. Accepts MAJOR, MAJOR.MINOR, or MAJOR.MINOR.PATCH.
 * Major and minor must be integers. Patch can have a pre-release suffix (e.g. 0-beta).
 * Strips trailing .x wildcard.
 * Returns the normalized string, or null if invalid.
 */
export function normalizeVersion(version) {
  const stripped = version.replace(/^v/, '').replace(/\.x$/i, '');

  const hyphenIdx = stripped.indexOf('-');
  const core = hyphenIdx === -1 ? stripped : stripped.substring(0, hyphenIdx);
  const preRelease = hyphenIdx === -1 ? '' : stripped.substring(hyphenIdx);

  const parts = core.split('.');
  if (parts.length < 1 || parts.length > 3) return null;

  if (!parts.every((p) => /^\d+$/.test(p))) return null;

  return parts.join('.') + preRelease;
}

// ──────────────────────────────────────────────
// CLI Input Schemas
// ──────────────────────────────────────────────

/**
 * Schema for a single colon-separated tag string.
 * Accepts TYPE:NAME or TYPE:NAME:VERSION.
 * Transforms to a normalized string.
 */
export const tagSchema = z.string().transform((raw, ctx) => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const parts = trimmed.split(':');

  if (parts.length === 2) {
    const [type, name] = parts;
    if (!type || !name) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid tag "${trimmed}": expected TYPE:NAME or TYPE:NAME:VERSION`,
      });
      return z.NEVER;
    }
    return `${type}:${name}`;
  }

  if (parts.length === 3) {
    const [type, name, version] = parts;
    if (!type || !name || !version) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid tag "${trimmed}": expected TYPE:NAME or TYPE:NAME:VERSION`,
      });
      return z.NEVER;
    }
    const normalized = normalizeVersion(version);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid version "${version}" in tag "${trimmed}": expected a numeric version (e.g. 3, 3.11, 3.11.0)`,
      });
      return z.NEVER;
    }
    return `${type}:${name}:${normalized}`;
  }

  ctx.addIssue({
    code: 'custom',
    message: `Invalid tag "${trimmed}": expected TYPE:NAME or TYPE:NAME:VERSION`,
  });
  return z.NEVER;
});

/**
 * Schema for a single XML tag string.
 * Accepts <tag type="..." name="..." /> or <tag type="..." name="..." version="..." />.
 * Transforms to a normalized canonical XML string.
 */
export const xmlTagSchema = z.string().transform((raw, ctx) => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const tagMatch = /^<tag\s+((?:\w+="[^"]*"(?:\s+|(?=\/>)))+)\/>$/.exec(trimmed);
  if (!tagMatch) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid XML tag "${trimmed}": expected <tag type="..." name="..." /> or <tag type="..." name="..." version="..." />`,
    });
    return z.NEVER;
  }

  const attrs = Object.create(null);
  const allowed = new Set(['type', 'name', 'version']);
  const attrRegex = /(\w+)="([^"<&]*)"/g;
  let match;
  while ((match = attrRegex.exec(tagMatch[1])) !== null) {
    const key = match[1];
    const value = match[2];
    if (!allowed.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid XML tag "${trimmed}": unknown attribute "${key}"`,
      });
      return z.NEVER;
    }
    if (Object.hasOwn(attrs, key)) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid XML tag "${trimmed}": duplicate attribute "${key}"`,
      });
      return z.NEVER;
    }
    attrs[key] = value;
  }

  if (!attrs.type) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid XML tag "${trimmed}": missing required "type" attribute`,
    });
    return z.NEVER;
  }
  if (!attrs.name) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid XML tag "${trimmed}": missing required "name" attribute`,
    });
    return z.NEVER;
  }

  if (attrs.version) {
    return `<tag type="${attrs.type}" name="${attrs.name}" version="${attrs.version}" />`;
  }
  return `<tag type="${attrs.type}" name="${attrs.name}" />`;
});

/**
 * Schema for a single XML feedback entry string.
 * Accepts <feedback idx="..." relevant="true|false" correct="true|false">optional comment</feedback>
 * or self-closing <feedback ... /> (normalized to expanded form).
 * Transforms to a canonical XML string with attribute order: idx, relevant, correct.
 */
export const feedbackEntrySchema = z.string().transform((raw, ctx) => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Match self-closing: <feedback ... />
  const selfClosing = /^<feedback\s+((?:\w+='[^']*'(?:\s+|(?=\/>)))+)\/>$/s.exec(trimmed);
  // Match open/close: <feedback ...>text</feedback>
  const openClose = /^<feedback\s+((?:\w+='[^']*'(?:\s+|(?=>)))+)>([\s\S]*)<\/feedback>$/s.exec(
    trimmed,
  );

  const attrStr = selfClosing?.[1] || openClose?.[1];
  if (!attrStr) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid feedback entry "${trimmed}": expected <feedback idx='...' relevant='true|false' correct='true|false'>optional comment</feedback>`,
    });
    return z.NEVER;
  }

  const comment = openClose ? openClose[2].trim() : '';

  const attrs = Object.create(null);
  const allowed = new Set(['idx', 'relevant', 'correct']);
  const attrRegex = /(\w+)='([^']*)'/g;
  let match;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    const key = match[1];
    const value = match[2];
    if (!allowed.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid feedback entry "${trimmed}": unknown attribute "${key}"`,
      });
      return z.NEVER;
    }
    if (Object.hasOwn(attrs, key)) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid feedback entry "${trimmed}": duplicate attribute "${key}"`,
      });
      return z.NEVER;
    }
    attrs[key] = value;
  }

  if (!attrs.idx) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid feedback entry "${trimmed}": missing required "idx" attribute`,
    });
    return z.NEVER;
  }
  const boolValues = new Set(['true', 'false']);
  if (!boolValues.has(attrs.relevant)) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid feedback entry "${trimmed}": "relevant" must be 'true' or 'false'`,
    });
    return z.NEVER;
  }
  if (!boolValues.has(attrs.correct)) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid feedback entry "${trimmed}": "correct" must be 'true' or 'false'`,
    });
    return z.NEVER;
  }

  return `<feedback idx='${attrs.idx}' relevant='${attrs.relevant}' correct='${attrs.correct}'>${comment}</feedback>`;
});

// ──────────────────────────────────────────────
// Command Input Schemas
// ──────────────────────────────────────────────

/**
 * Schema for query command input.
 */
export const queryInputSchema = z.object({
  query: nonEmptyString,
});

/**
 * Schema for insights command input.
 */
export const insightsInputSchema = z.object({
  sessionId: nonEmptyString,
  taskIndex: z.union([z.string(), z.number()]).transform(String),
});

/**
 * Schema for share command input.
 */
export const shareInputSchema = z.object({
  sessionId: nonEmptyString,
  title: nonEmptyString,
  content: nonEmptyString,
  taskIndex: nonEmptyString,
  sources: z.string().optional(),
});

/**
 * Schema for share-task command input.
 */
export const shareTaskInputSchema = z.object({
  query: nonEmptyString,
  title: nonEmptyString,
  content: nonEmptyString,
});

// ──────────────────────────────────────────────
// OAuth Schemas
// ──────────────────────────────────────────────

/**
 * Normalize snake_case OAuth token response fields to camelCase.
 */
function normalizeTokenResponse(data) {
  if (!data || typeof data !== 'object') return data;
  return {
    accessToken: data.accessToken || data.access_token,
    refreshToken: data.refreshToken || data.refresh_token,
    expiresIn: data.expiresIn || data.expires_in,
    tokenType: data.tokenType || data.token_type || 'Bearer',
  };
}

export const tokenResponseSchema = z.preprocess(
  normalizeTokenResponse,
  z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().optional(),
    expiresIn: z.number().positive().optional(),
    tokenType: z.string().default('Bearer'),
  }),
);

export const protectedResourceSchema = z.looseObject({
  authorization_servers: z.array(z.string()).optional(),
  bearer_methods_supported: z.array(z.string()).optional(),
});

export const authorizationServerSchema = z
  .looseObject({
    authorization_endpoint: z.string().optional(),
    authorizationEndpoint: z.string().optional(),
    token_endpoint: z.string().optional(),
    tokenEndpoint: z.string().optional(),
    registration_endpoint: z.string().optional(),
    registrationEndpoint: z.string().optional(),
    bearer_methods_supported: z.array(z.string()).optional(),
  })
  .refine((d) => d.authorization_endpoint || d.authorizationEndpoint, {
    message: 'OAuth discovery missing authorization_endpoint',
  })
  .refine((d) => d.token_endpoint || d.tokenEndpoint, {
    message: 'OAuth discovery missing token_endpoint',
  })
  .transform((d) => ({
    ...d,
    authorizationEndpoint: d.authorizationEndpoint || d.authorization_endpoint,
    tokenEndpoint: d.tokenEndpoint || d.token_endpoint,
    registrationEndpoint: d.registrationEndpoint || d.registration_endpoint,
    bearerMethodsSupported: d.bearer_methods_supported,
  }));

export const clientRegistrationResponseSchema = z.looseObject({
  client_id: z.string().min(1),
});

// ──────────────────────────────────────────────
// Settings Schemas
// ──────────────────────────────────────────────

export const credentialSchema = z.looseObject({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().nullable().optional(),
  tokenType: z.string().optional(),
  apiKey: z.string().optional(),
  token: z.string().optional(),
});

const credentialsMapSchema = z.record(z.string(), credentialSchema);

const clientEntrySchema = z.looseObject({
  client_id: z.string(),
});

const clientsMapSchema = z.record(z.string(), clientEntrySchema);

export const initDataSchema = z.looseObject({
  ides: z.array(z.string()),
  skillsVersion: z.string(),
  variant: z.string().optional(),
});

export const versionCacheSchema = z.looseObject({
  version: z.string().min(1),
  checkedAt: z.number(),
});

export const compatibilityDataSchema = z.looseObject({
  minimum_version: z.string().optional(),
  deprecations: z
    .array(
      z.looseObject({
        version_below: z.string().optional(),
        message: z.string().optional(),
      }),
    )
    .optional(),
  message: z.string().optional(),
});

export const compatibilityCacheSchema = z.looseObject({
  data: compatibilityDataSchema,
  checkedAt: z.number(),
});

export const settingsSchema = z.looseObject({
  apiBase: z.string().optional(),
  credentials: z.union([credentialsMapSchema, credentialSchema]).optional(),
  clients: clientsMapSchema.optional(),
  client: z.looseObject({}).optional(),
  latestVersion: versionCacheSchema.nullable().optional(),
  compatibility: compatibilityCacheSchema.nullable().optional(),
  skillsVersion: versionCacheSchema.nullable().optional(),
  init: initDataSchema.optional(),
  globalInit: initDataSchema.optional(),
  projects: z.array(z.any()).optional(),
});

// ──────────────────────────────────────────────
// API Response Schemas
// ──────────────────────────────────────────────

export const toolResponseSchema = z.looseObject({});

export const npmVersionResponseSchema = z.looseObject({
  version: z.string().min(1),
});
