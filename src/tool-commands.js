import { collectTags, parseSources, parseFeedbackEntries } from './parse-tags.js';
import { output, outputError } from './output.js';
import { callMcpTool, validateArgs } from './mcp-client.js';
import { getApiBase } from './constants.js';
import { fetchToolManifest } from './tool-manifest.js';

/**
 * Default dependencies for the generic tool action. Injectable for tests so the
 * dynamic command layer can be exercised with no live server (mirrors the `deps`
 * pattern used by `apiRequest`/`mcp-client`/`tool-manifest`).
 *
 * `refresh` force-fetches + writes the manifest (ignoring TTL) and is itself
 * fail-open — used to self-heal a stale cached `inputSchema` when the server
 * rejects `tools/call` args as invalid. No import cycle: tool-manifest does not
 * import tool-commands.
 */
const defaultDeps = {
  callTool: callMcpTool,
  validate: validateArgs,
  getBase: getApiBase,
  refresh: fetchToolManifest,
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
  return property.replaceAll('_', '-');
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
  return property.replaceAll(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
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
 * Register a single `--flag <value>` option on `cmd` (required or optional), with an
 * optional repeatable collector. Centralizes the requiredOption/option branching
 * shared by the string / number / enum / array-of-string flag shapes.
 */
function addValueFlag(cmd, flagName, spec, required, collector) {
  const flag = `--${flagName} <value>`;
  const desc = buildOptionDescription(spec, { required });
  const optionArgs = collector ? [flag, desc, collector] : [flag, desc];
  if (required) cmd.requiredOption(...optionArgs);
  else cmd.option(...optionArgs);
}

/**
 * Derive commander flags for a single non-special schema property. Returns nothing
 * (mutates `cmd`); throws a clear error on an unsupported nested/array shape.
 */
function addPropertyFlag(cmd, toolName, property, spec, required) {
  const flagName = toFlagName(property);
  const type = spec?.type;

  // enum + scalar types all register as a single `--flag <value>` (ajv enforces enum
  // membership / numeric type; numbers are coerced in buildArgs).
  if (Array.isArray(spec?.enum) || type === 'string' || type === 'number' || type === 'integer') {
    addValueFlag(cmd, flagName, spec, required);
    return;
  }

  if (type === 'boolean') {
    cmd.option(`--${flagName}`, buildOptionDescription(spec));
    return;
  }

  if (type === 'array' && spec?.items?.type === 'string') {
    addValueFlag(cmd, flagName, spec, required, appendValue);
    return;
  }

  if (type === 'array') {
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
 * Coerce a scalar flag value to the type its schema declares. number/integer flags
 * are converted with `Number()` and reject non-numeric input — ajv treats `NaN` as a
 * valid JSON-Schema `number` (serialized as `null` over the wire), so without this
 * guard it would slip past the validation gate and reach `tools/call`.
 */
function coerceScalar(spec, value, property) {
  if (spec?.type !== 'number' && spec?.type !== 'integer') return value;
  const coerced = Number(value);
  if (Number.isNaN(coerced)) {
    throw new TypeError(`Invalid value for --${toFlagName(property)}: expected a number`);
  }
  return coerced;
}

/**
 * Resolve the `tools/call` argument value for one schema property from the parsed
 * commander options, applying the tags/sources/feedback special-case parsers.
 * Returns `undefined` when the property should be omitted from the args object.
 * Throws (caught by `makeToolAction`) on invalid input — e.g. a non-numeric number
 * or a missing required `feedback` entry — so it never reaches `tools/call`.
 */
function buildArgValue(property, spec, options, required) {
  if (property === 'tags') {
    const tags = collectTags(options);
    return tags.length > 0 ? tags : undefined;
  }
  if (property === 'sources') {
    if (!options.sources) return undefined;
    const sources = parseSources(options.sources);
    return sources.length > 0 ? sources : undefined;
  }
  if (property === 'feedback') {
    const feedback = parseFeedbackEntries(options.feedback);
    if (feedback.length > 0) return feedback;
    // Only hard-fail when the server schema marks feedback required; otherwise omit
    // the key and let ajv/server decide (server stays authoritative).
    if (required.has('feedback')) {
      throw new Error('At least one --feedback entry is required');
    }
    return undefined;
  }

  const value = options[toOptionKey(property)];
  if (value === undefined) return undefined;
  return coerceScalar(spec, value, property);
}

/**
 * Build the `arguments` object for `tools/call` purely from the parsed commander
 * options. Each property is resolved via `buildArgValue` (which applies the
 * tags/sources/feedback special-case parsers and numeric coercion) and written back
 * under its verbatim schema property name; properties that resolve to `undefined`
 * are omitted.
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
    const value = buildArgValue(property, spec, options, required);
    if (value !== undefined) args[property] = value;
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
 * Heuristic for "the server rejected our args because the schema is wrong/stale".
 * A precise JSON-RPC InvalidParams (-32602) is the strongest signal; otherwise we
 * sniff the error text for validation/schema language. Used to decide whether to
 * force-refresh the cached manifest so the NEXT invocation registers the tool with
 * the server's current schema (stale-schema self-heal).
 */
const VALIDATION_HINT =
  /\b(validation|schema)\b|invalid (argument|parameter|param|input|value|propert)|required (propert|field|argument|parameter)|must (be|have|match)|does ?n['’]?t match|unexpected (propert|field)/i;

function isSchemaValidationError(errOrResult) {
  if (errOrResult?.code === -32602) return true; // JSON-RPC InvalidParams (precise signal)
  const text =
    typeof errOrResult?.message === 'string' ? errOrResult.message : toolErrorMessage(errOrResult);
  return VALIDATION_HINT.test(text || '');
}

/**
 * When the server rejects args as invalid, our cached `inputSchema` is likely
 * stale — force a manifest refresh (ignoring TTL) so the NEXT invocation registers
 * the tool with the server's current schema. Fail-open: a refresh failure must not
 * mask the original error. Awaited BEFORE outputError (which calls process.exit).
 */
async function maybeRefreshOnInvalidSchema(d, apiBase, errOrResult) {
  if (isSchemaValidationError(errOrResult)) {
    await d.refresh(apiBase).catch(() => {});
  }
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
    const command = handlerArgs.at(-1);
    const options = handlerArgs.at(-2) ?? {};
    // Hoisted above the try so it is available in the catch for a refresh.
    const apiBase = d.getBase();

    try {
      const argsObject = buildArgs(tool, options);

      // Validate against the cached schema captured at registration. The server
      // stays authoritative; this gate only produces friendly client-side errors.
      // On failure, surface a friendly message and exit 1 BEFORE any network call —
      // tools/call is never reached (AC13).
      const { valid, errors } = d.validate(tool.inputSchema, argsObject);
      if (!valid) {
        outputError(new Error(errors[0] ?? 'Invalid arguments'), command);
        return;
      }

      const result = await d.callTool(apiBase, tool.serverName, argsObject, command);

      // The SDK signals tool-level failures as { isError: true } over HTTP 200
      // (it does NOT throw), so route those through outputError for exit 1.
      if (result?.isError === true) {
        await maybeRefreshOnInvalidSchema(d, apiBase, result);
        outputError(new Error(toolErrorMessage(result)), command);
        return;
      }

      output(result, command);
    } catch (err) {
      await maybeRefreshOnInvalidSchema(d, apiBase, err);
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
