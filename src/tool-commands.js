import { collectTags, parseSources, parseFeedbackEntries } from './parse-tags.js';
import { output, outputError } from './output.js';
import { callMcpTool, validateArgs } from './mcp-client.js';
import { getApiBase } from './constants.js';

/**
 * Default dependencies for the generic tool action. Injectable for tests so the
 * dynamic command layer can be exercised with no live server (mirrors the `deps`
 * pattern used by `apiRequest`/`mcp-client`/`tool-manifest`).
 */
const defaultDeps = {
  callTool: callMcpTool,
  validate: validateArgs,
  getBase: getApiBase,
};

const TAGS_FLAGS_DESCRIPTION =
  'Tag describing your context (can be repeated, e.g., --tag language:python:3.11 --tag task_type:bug_fix)';
const XML_TAG_DESCRIPTION =
  'Pre-formed XML tag (can be repeated, e.g., --xml-tag \'<tag type="language" name="python" />\')';
const SOURCES_DESCRIPTION = 'Source insight/document IDs from Spark (comma-separated)';
const FEEDBACK_DESCRIPTION =
  "Feedback entry: <feedback idx='TYPE-IDX' relevant='true|false' correct='true|false'>optional comment</feedback>";

/** Convert a snake_case schema property name to a kebab-case CLI flag name. */
function toFlagName(property) {
  return property.replace(/_/g, '-');
}

/**
 * Derive a concise one-line summary from a tool's (often multi-paragraph) server
 * description. Commander shows `.summary()` in the parent command list (`spark
 * --help`) and the full `.description()` in `spark <cmd> --help`, so this keeps the
 * top-level listing readable without losing any detail on the per-command help.
 *
 * Takes the first non-empty line; if that line continues into a sentence we keep
 * only the first sentence so the summary stays short.
 */
function summarize(description) {
  if (typeof description !== 'string') return '';
  const firstLine = description
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return '';
  const sentenceEnd = firstLine.search(/[.!?](\s|$)/);
  return sentenceEnd === -1 ? firstLine : firstLine.slice(0, sentenceEnd + 1);
}

/**
 * Convert a schema property name to its commander option key (camelCase).
 * A snake_case or kebab-case property is registered as a kebab-case `--flag`,
 * which commander stores under a camelCase key (e.g. `session_id` → `--session-id`
 * → `opts.sessionId`). This must mirror that transform so `buildArgs` can read the
 * stored value back, hence BOTH `-` and `_` before a lowercase letter are folded.
 */
function toOptionKey(property) {
  return property.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
}

/** Repeatable collector (matches the existing --tag/--xml-tag pattern). */
function appendValue(val, prev) {
  return prev ? [...prev, val] : [val];
}

/**
 * Compose the help text for a derived option (carries the schema description and
 * required-ness / enum choices into the flag help).
 */
function buildOptionDescription(spec, { required } = {}) {
  const parts = [];
  if (spec?.description) parts.push(spec.description);
  if (Array.isArray(spec?.enum) && spec.enum.length > 0) {
    parts.push(`(choices: ${spec.enum.join(', ')})`);
  }
  if (required) parts.push('(required)');
  return parts.join(' ');
}

/**
 * Derive commander flags for a single non-special schema property. Returns nothing
 * (mutates `cmd`); throws a clear error on an unsupported nested/array shape.
 */
function addPropertyFlag(cmd, toolName, property, spec, required) {
  const flagName = toFlagName(property);
  const type = spec?.type;

  // enum is treated as a single-value string flag (ajv enforces membership).
  if (Array.isArray(spec?.enum)) {
    const flag = `--${flagName} <value>`;
    const desc = buildOptionDescription(spec, { required });
    if (required) cmd.requiredOption(flag, desc);
    else cmd.option(flag, desc);
    return;
  }

  if (type === 'string' || type === 'number' || type === 'integer') {
    const flag = `--${flagName} <value>`;
    const desc = buildOptionDescription(spec, { required });
    if (required) cmd.requiredOption(flag, desc);
    else cmd.option(flag, desc);
    return;
  }

  if (type === 'boolean') {
    cmd.option(`--${flagName}`, buildOptionDescription(spec));
    return;
  }

  if (type === 'array') {
    const itemType = spec?.items?.type;
    if (itemType === 'string') {
      const flag = `--${flagName} <value>`;
      const desc = buildOptionDescription(spec, { required });
      if (required) cmd.requiredOption(flag, desc, appendValue);
      else cmd.option(flag, desc, appendValue);
      return;
    }
    throw new Error(
      `Unsupported inputSchema for tool "${toolName}": property "${property}" is an array of non-string items`,
    );
  }

  throw new Error(
    `Unsupported inputSchema for tool "${toolName}": property "${property}" has unsupported shape`,
  );
}

/**
 * Derive commander flags for a tool from its JSON-Schema `inputSchema`. Mutates
 * `cmd`. Throws a clear error on an unsupported nested/object/non-string-array
 * shape (loud failure, never a silent drop).
 *
 * The command surface is a pure reflection of the server schema: EVERY property
 * becomes a `--flag` (required props — those in `inputSchema.required` — become
 * required options). The `tags` / `sources` / `feedback` properties are
 * special-cased to the existing `--tag`/`--xml-tag`, `--sources`, and `--feedback`
 * flags so the dynamic commands keep today's parsing UX.
 *
 * @param {object} inputSchema
 * @param {import('commander').Command} cmd
 * @param {string} [toolName] - used for error messages
 */
export function deriveFlags(inputSchema, cmd, toolName = cmd?.name?.() ?? '') {
  const properties = inputSchema?.properties ?? {};
  const required = new Set(Array.isArray(inputSchema?.required) ? inputSchema.required : []);

  for (const [property, spec] of Object.entries(properties)) {
    if (property === 'tags') {
      cmd.option('--tag <tag>', TAGS_FLAGS_DESCRIPTION, appendValue);
      cmd.option('--xml-tag <tag>', XML_TAG_DESCRIPTION, appendValue);
      continue;
    }
    if (property === 'sources') {
      cmd.option('--sources <items>', SOURCES_DESCRIPTION);
      continue;
    }
    if (property === 'feedback') {
      cmd.option('--feedback <xml>', FEEDBACK_DESCRIPTION, appendValue);
      continue;
    }

    addPropertyFlag(cmd, toolName, property, spec, required.has(property));
  }
}

/**
 * Build the `arguments` object for `tools/call` purely from the parsed commander
 * options, applying the same special-case helpers the hand-written commands used:
 * `collectTags` for `tags`, `parseSources` for `sources`, `parseFeedbackEntries`
 * for `feedback`. Every other property is read from `options` (by its camelCase
 * option key) and written back under its verbatim schema property name. Number/
 * integer flags are coerced to Number; non-numeric input throws a client-side
 * validation error (never sent as NaN/null).
 *
 * @param {object} tool - manifest tool entry ({ serverName, inputSchema, ... })
 * @param {object} options - commander options object
 * @returns {object} the arguments object passed to the tool
 */
export function buildArgs(tool, options = {}) {
  const inputSchema = tool?.inputSchema ?? {};
  const properties = inputSchema.properties ?? {};
  const required = new Set(Array.isArray(inputSchema.required) ? inputSchema.required : []);
  const args = {};

  for (const [property, spec] of Object.entries(properties)) {
    if (property === 'tags') {
      const tags = collectTags(options);
      if (tags.length > 0) args.tags = tags;
      continue;
    }
    if (property === 'sources') {
      if (options.sources) {
        const sources = parseSources(options.sources);
        if (sources.length > 0) args.sources = sources;
      }
      continue;
    }
    if (property === 'feedback') {
      const feedback = parseFeedbackEntries(options.feedback);
      if (feedback.length === 0) {
        // Only hard-fail when the server schema marks feedback required; otherwise
        // omit the key and let ajv/server decide (server stays authoritative).
        if (required.has('feedback')) {
          throw new Error('At least one --feedback entry is required');
        }
        continue;
      }
      args.feedback = feedback;
      continue;
    }

    const optionKey = toOptionKey(property);
    const value = options[optionKey];
    if (value === undefined) continue;

    if (spec?.type === 'number' || spec?.type === 'integer') {
      const coerced = Number(value);
      // Reject non-numeric input client-side. ajv accepts NaN as a valid JSON-Schema
      // `number` (serialized as null over the wire), so it would otherwise slip past
      // the validation gate and reach tools/call. Throwing here is caught by
      // makeToolAction and routed through outputError (exit 1) before any network call.
      if (Number.isNaN(coerced)) {
        throw new Error(`Invalid value for --${toFlagName(property)}: expected a number`);
      }
      args[property] = coerced;
    } else {
      args[property] = value;
    }
  }

  return args;
}

/**
 * Extract a human-readable error message from a tool result flagged `isError`.
 * The MCP SDK returns tool-level failures as `{ isError: true, content: [...] }`
 * over HTTP 200 (it does NOT throw), so we surface the text content here.
 */
function toolErrorMessage(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const text = content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
  return text || 'Tool call failed';
}

/**
 * Build the generic async action handler for a single tool. The handler:
 *   1. assembles the `arguments` object purely from flags (special cases applied),
 *   2. validates client-side against the cached `tool.inputSchema` and, on failure,
 *      calls `outputError` and NEVER reaches `tools/call` (AC13),
 *   3. on valid input calls `callMcpTool` with the tool's verbatim `serverName`,
 *   4. routes tool-level failures (`result.isError === true`) through `outputError`
 *      (exit 1), matching the old `apiRequest`→exit-1 behavior, and prints a
 *      successful result via `output` (honoring `--pretty`).
 *
 * One MCP handshake per call: validation uses the schema captured at registration
 * (refreshed at login/init/TTL), so there is no extra `tools/list` round-trip here.
 *
 * @param {object} tool - manifest tool entry
 * @param {object} [deps] - injectable { callTool, validate, getBase }
 * @returns {(...args: any[]) => Promise<void>}
 */
export function makeToolAction(tool, deps = {}) {
  const d = { ...defaultDeps, ...deps };

  return async function toolAction(...handlerArgs) {
    // commander passes: (options, command) — no positional arguments.
    const command = handlerArgs[handlerArgs.length - 1];
    const options = handlerArgs[handlerArgs.length - 2] ?? {};

    try {
      const apiBase = d.getBase();
      const argsObject = buildArgs(tool, options);

      // Validate against the cached schema captured at registration. The server
      // stays authoritative; this gate only produces friendly client-side errors.
      const { valid, errors } = d.validate(tool.inputSchema, argsObject);
      if (!valid) {
        // Client-side validation error — surface a friendly message and exit 1
        // BEFORE any network call. tools/call is never reached.
        throw new Error(errors[0] ?? 'Invalid arguments');
      }

      const result = await d.callTool(apiBase, tool.serverName, argsObject, command);

      // The SDK signals tool-level failures as { isError: true } over HTTP 200
      // (it does NOT throw), so route those through outputError for exit 1.
      if (result?.isError === true) {
        throw new Error(toolErrorMessage(result));
      }

      output(result, command);
    } catch (err) {
      outputError(err, command);
    }
  };
}

/**
 * Register one commander subcommand per cached tool. Called from `bin/spark.js`
 * with the offline manifest (`getManifestForRegistration()`). When the manifest is
 * empty (cold/foreign cache), no dynamic commands are registered and a "run spark
 * login" hint is appended to the program help text.
 *
 * @param {import('commander').Command} program
 * @param {Array} [tools] - cached manifest tools (from getManifestForRegistration)
 * @param {object} [deps] - forwarded to each tool action (injectable for tests)
 */
export function registerToolCommands(program, tools = [], deps = {}) {
  if (!Array.isArray(tools) || tools.length === 0) {
    program.addHelpText(
      'after',
      "\nNo tools loaded yet. Run 'spark login' or 'spark init' to load available commands.",
    );
    return;
  }

  for (const tool of tools) {
    // The command name is the verbatim server tool name (e.g. `create_memory`,
    // `search`) — no kebab-casing, no friendly remapping.
    const cmd = program.command(tool.serverName);
    if (tool.description) {
      cmd.description(tool.description);
      // A concise one-liner for the top-level `spark --help` listing; the full
      // (possibly multi-paragraph) description still shows on `spark <cmd> --help`.
      const summary = summarize(tool.description);
      if (summary) cmd.summary(summary);
    }
    deriveFlags(tool.inputSchema, cmd, tool.serverName);
    cmd.action(makeToolAction(tool, deps));
  }
}
