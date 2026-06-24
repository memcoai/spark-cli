import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import {
  deriveFlags,
  buildArgs,
  makeToolAction,
  registerToolCommands,
} from '../src/tool-commands.js';
import { validateArgs } from '../src/mcp-client.js';
import {
  setupCommandMocks,
  getErrorOutput,
  getLogOutput,
  tagValidationTests,
  xmlTagValidationTests,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Test fixtures: tool manifest entries (no live server — pure JSON-Schema input)
// Entries are a pure reflection of the server: serverName only (no friendly
// `name` field), and EVERY schema property is surfaced as a --flag.
// ---------------------------------------------------------------------------

/** A representative tool exercising every supported flag shape. */
const queryTool = {
  serverName: 'search',
  description: 'Query the knowledge network',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      limit: { type: 'number', description: 'Max results' },
      offset: { type: 'integer', description: 'Result offset' },
      scope: { type: 'string', enum: ['team', 'global'], description: 'Search scope' },
      verbose: { type: 'boolean', description: 'Verbose output' },
      labels: { type: 'array', items: { type: 'string' }, description: 'Filter labels' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Context tags' },
    },
    required: ['query'],
  },
};

/** A tags-declaring tool (mirrors today's create_memory UX, all flags). */
const shareTaskTool = {
  serverName: 'create_memory',
  description: 'Share task insights',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The task summary' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Context tags' },
    },
    required: ['query'],
  },
};

/**
 * A tool declaring multi-word snake_case props + sources + feedback special-cases.
 * `session_id` / `memory_idx` are registered as `--session-id` / `--memory-idx`
 * and must round-trip back to their snake_case schema names in the args object.
 */
const feedbackTool = {
  serverName: 'share_feedback',
  description: 'Provide feedback',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session identifier' },
      memory_idx: { type: 'integer', description: 'Memory index' },
      sources: { type: 'array', items: { type: 'string' }, description: 'Source IDs' },
      feedback: { type: 'array', items: { type: 'string' }, description: 'Feedback entries' },
    },
    required: ['session_id'],
  },
};

// A passing validator (used so the validation gate never blocks the call path
// in arg-assembly / happy-path tests). The validation-gate tests override it.
const okValidate = () => ({ valid: true, errors: [] });

describe('tool-commands', () => {
  // =========================================================================
  // AC12 — flag derivation (deriveFlags is pure: real Command, no DI)
  // =========================================================================
  describe('deriveFlags (AC12)', () => {
    const flagSpec = (cmd, name) => cmd.options.find((o) => o.long === `--${name}`);

    it('maps string/number/integer/boolean/enum/array-of-string to flags', () => {
      const cmd = new Command('search');
      deriveFlags(queryTool.inputSchema, cmd, 'search');

      // string/number/integer/enum take <value>
      assert.ok(flagSpec(cmd, 'query'), '--query derived');
      assert.ok(flagSpec(cmd, 'limit'), '--limit derived');
      assert.ok(flagSpec(cmd, 'limit').required, '--limit takes a value');
      assert.ok(flagSpec(cmd, 'offset'), '--offset derived');
      assert.ok(flagSpec(cmd, 'scope'), '--scope (enum) derived');

      // boolean is a bare flag (no <value>)
      const verbose = flagSpec(cmd, 'verbose');
      assert.ok(verbose, '--verbose derived');
      assert.strictEqual(verbose.required, false, '--verbose is a boolean flag');

      // array-of-string is repeatable (variadic collector); shows <value>
      const labels = flagSpec(cmd, 'labels');
      assert.ok(labels, '--labels derived');
      assert.ok(labels.required, '--labels takes a value');
    });

    it('registers NO positional arguments — every property is a flag', () => {
      const cmd = new Command('search');
      deriveFlags(queryTool.inputSchema, cmd, 'search');
      assert.strictEqual(cmd.registeredArguments.length, 0, 'no positional arguments');
      assert.ok(flagSpec(cmd, 'query'), 'query is surfaced as --query, not a positional');
    });

    it('lists enum choices in the option description', () => {
      const cmd = new Command('search');
      deriveFlags(queryTool.inputSchema, cmd, 'search');
      const scope = flagSpec(cmd, 'scope');
      assert.match(scope.description, /choices: team, global/);
    });

    it('marks a required prop as a required option (e.g. --query)', () => {
      const cmd = new Command('search');
      deriveFlags(queryTool.inputSchema, cmd, 'search');
      const query = flagSpec(cmd, 'query');
      assert.ok(query.mandatory, '--query is a required option');
      assert.match(query.description, /\(required\)/);
    });

    it('maps a snake_case required prop to a kebab-case required flag (--session-id)', () => {
      const cmd = new Command('share_feedback');
      deriveFlags(feedbackTool.inputSchema, cmd, 'share_feedback');
      const sessionId = flagSpec(cmd, 'session-id');
      assert.ok(sessionId, '--session-id derived from session_id');
      assert.ok(sessionId.mandatory, '--session-id is required');
    });

    it('registers --tag and --xml-tag for a tags property', () => {
      const cmd = new Command('create_memory');
      deriveFlags(shareTaskTool.inputSchema, cmd, 'create_memory');
      assert.ok(
        cmd.options.find((o) => o.long === '--tag'),
        '--tag registered',
      );
      assert.ok(
        cmd.options.find((o) => o.long === '--xml-tag'),
        '--xml-tag registered',
      );
    });

    it('registers --sources and --feedback for those special-case properties', () => {
      const cmd = new Command('share_feedback');
      deriveFlags(feedbackTool.inputSchema, cmd, 'share_feedback');
      assert.ok(
        cmd.options.find((o) => o.long === '--sources'),
        '--sources registered',
      );
      assert.ok(
        cmd.options.find((o) => o.long === '--feedback'),
        '--feedback registered',
      );
    });

    it('FAILS LOUD on a nested object property', () => {
      const cmd = new Command('weird');
      assert.throws(
        () =>
          deriveFlags({ type: 'object', properties: { meta: { type: 'object' } } }, cmd, 'weird'),
        /Unsupported inputSchema for tool "weird": property "meta" has unsupported shape/,
      );
    });

    it('FAILS LOUD on an array of non-string items', () => {
      const cmd = new Command('weird');
      assert.throws(
        () =>
          deriveFlags(
            { type: 'object', properties: { nums: { type: 'array', items: { type: 'number' } } } },
            cmd,
            'weird',
          ),
        /property "nums" is an array of non-string items/,
      );
    });
  });

  // =========================================================================
  // AC14 — arg assembly / special cases (buildArgs is pure)
  // =========================================================================
  describe('buildArgs (AC14)', () => {
    it('reads a flag value onto its schema property name', () => {
      const args = buildArgs(queryTool, { query: 'rust async' });
      assert.strictEqual(args.query, 'rust async');
    });

    it('coerces valid number/integer flags to Number', () => {
      const args = buildArgs(queryTool, { query: 'q', limit: '5', offset: '10' });
      assert.strictEqual(args.limit, 5);
      assert.strictEqual(args.offset, 10);
      assert.strictEqual(typeof args.limit, 'number');
    });

    it('passes through string/boolean/array-of-string flags', () => {
      const args = buildArgs(queryTool, {
        query: 'q',
        scope: 'team',
        verbose: true,
        labels: ['a', 'b'],
      });
      assert.strictEqual(args.scope, 'team');
      assert.strictEqual(args.verbose, true);
      assert.deepStrictEqual(args.labels, ['a', 'b']);
    });

    it('omits undefined flags from the arguments object', () => {
      const args = buildArgs(queryTool, { query: 'q' });
      assert.ok(!('limit' in args), 'unset --limit omitted');
      assert.ok(!('scope' in args), 'unset --scope omitted');
    });

    it('reads a multi-word snake_case flag (--session-id → opts.sessionId → args.session_id)', () => {
      // commander stores --session-id under the camelCase key sessionId.
      const args = buildArgs(feedbackTool, { sessionId: 'sess-1' });
      assert.strictEqual(args.session_id, 'sess-1', 'round-trips to the snake_case schema name');
      assert.ok(!('sessionId' in args), 'camelCase key not leaked into the args object');
    });

    it('coerces a multi-word snake_case integer flag (--memory-idx → args.memory_idx number)', () => {
      // commander stores --memory-idx under the camelCase key memoryIdx.
      const args = buildArgs(feedbackTool, { sessionId: 'sess-1', memoryIdx: '2' });
      assert.strictEqual(args.memory_idx, 2, 'round-trips to snake_case and is coerced to Number');
      assert.strictEqual(typeof args.memory_idx, 'number');
    });

    it('serializes tags via collectTags (--tag colon format)', () => {
      const args = buildArgs(shareTaskTool, { query: 'fix bug', tag: 'language:python:3.11' });
      assert.deepStrictEqual(args.tags, ['<tag type="language" name="python" version="3.11" />']);
    });

    it('serializes tags via collectTags (--xml-tag)', () => {
      const args = buildArgs(shareTaskTool, {
        query: 'fix bug',
        xmlTag: '<tag type="language" name="rust" />',
      });
      assert.deepStrictEqual(args.tags, ['<tag type="language" name="rust" />']);
    });

    it('omits tags when none are supplied', () => {
      const args = buildArgs(shareTaskTool, { query: 'fix bug' });
      assert.ok(!('tags' in args), 'empty tags omitted');
    });

    it('serializes sources via parseSources (comma-separated)', () => {
      const args = buildArgs(feedbackTool, { sessionId: 'sess-1', sources: 'a, b ,c' });
      assert.deepStrictEqual(args.sources, ['a', 'b', 'c']);
    });

    it('serializes feedback via parseFeedbackEntries', () => {
      const xml = "<feedback idx='memory-0' relevant='true' correct='false'>useful</feedback>";
      const args = buildArgs(feedbackTool, { sessionId: 'sess-1', feedback: [xml] });
      assert.strictEqual(args.feedback.length, 1);
    });

    it('throws when feedback is required by the schema but none supplied', () => {
      const requiredFeedbackTool = {
        ...feedbackTool,
        inputSchema: {
          ...feedbackTool.inputSchema,
          required: ['session_id', 'feedback'],
        },
      };
      assert.throws(
        () => buildArgs(requiredFeedbackTool, { sessionId: 'sess-1', feedback: [] }),
        /At least one --feedback entry is required/,
      );
    });

    it('omits feedback (no throw) when feedback is NOT required and none supplied', () => {
      const args = buildArgs(feedbackTool, { sessionId: 'sess-1', feedback: [] });
      assert.ok(!('feedback' in args), 'optional feedback omitted');
    });
  });

  // =========================================================================
  // AC13 — the validation gate (critical): invalid args never reach callTool
  // =========================================================================
  describe('validation gate (AC13)', () => {
    const mocks = setupCommandMocks();

    it('rejects invalid args (validate fails) and NEVER calls callTool, exit 1', async () => {
      const callTool = mock.fn(async () => ({ ok: true }));
      const validate = mock.fn(() => ({
        valid: false,
        errors: ['must have required property query'],
      }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate,
        getBase: () => 'https://spark.memco.ai',
      });

      // commander invokes: (options, command)
      await action({}, null);

      assert.strictEqual(callTool.mock.calls.length, 0, 'callTool must NOT be reached');
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1, 'exit 1');
      const out = getErrorOutput(mocks.logMock);
      assert.strictEqual(out.error, true);
      assert.match(out.message, /required property query/);
    });

    it('rejects --limit abc (non-numeric number) client-side without reaching callTool', async () => {
      const callTool = mock.fn(async () => ({ ok: true }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate, // even with a permissive validator, coercion guards first
        getBase: () => 'https://spark.memco.ai',
      });

      await action({ query: 'q', limit: 'abc' }, null);

      assert.strictEqual(callTool.mock.calls.length, 0, 'callTool must NOT be reached for NaN');
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1, 'exit 1');
      const out = getErrorOutput(mocks.logMock);
      assert.match(out.message, /Invalid value for --limit: expected a number/);
    });

    it('routes a server result with { isError: true } through outputError → exit 1', async () => {
      const callTool = mock.fn(async () => ({
        isError: true,
        content: [{ type: 'text', text: 'server says no' }],
      }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => 'https://spark.memco.ai',
      });

      await action({ query: 'q' }, null);

      assert.strictEqual(callTool.mock.calls.length, 1, 'callTool was reached (valid args)');
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1, 'isError → exit 1');
      const out = getErrorOutput(mocks.logMock);
      assert.strictEqual(out.error, true);
      assert.match(out.message, /server says no/);
    });

    it('isError with no text content falls back to a generic failure message', async () => {
      const callTool = mock.fn(async () => ({ isError: true, content: [] }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => 'https://spark.memco.ai',
      });

      await action({ query: 'q' }, null);
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
      const out = getErrorOutput(mocks.logMock);
      assert.match(out.message, /Tool call failed/);
    });

    it('uses the REAL validateArgs (ajv) to reject a missing required prop, no callTool', async () => {
      const callTool = mock.fn(async () => ({ ok: true }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate: validateArgs, // real SDK-bundled ajv, no DI
        getBase: () => 'https://spark.memco.ai',
      });

      // queryTool requires `query`; passing no --query omits it → ajv rejects.
      await action({}, null);

      assert.strictEqual(callTool.mock.calls.length, 0, 'real validation gate blocks the call');
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1, 'exit 1');
      const out = getErrorOutput(mocks.logMock);
      assert.strictEqual(out.error, true);
    });
  });

  // =========================================================================
  // Stale-schema self-heal: a SERVER validation error force-refreshes the manifest
  // =========================================================================
  describe('schema-validation refresh', () => {
    const mocks = setupCommandMocks();
    const API = 'https://spark.memco.ai';

    it('isError with a validation message → refresh(apiBase) then exit 1', async () => {
      const refresh = mock.fn(async () => ({}));
      const callTool = mock.fn(async () => ({
        isError: true,
        content: [{ type: 'text', text: 'invalid argument: query must be a string' }],
      }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => API,
        refresh,
      });

      await action({ query: 'q' }, null);

      assert.strictEqual(refresh.mock.calls.length, 1, 'refresh called once on validation error');
      assert.strictEqual(refresh.mock.calls[0].arguments[0], API, 'refresh called with apiBase');
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1, 'still exits 1');
      const out = getErrorOutput(mocks.logMock);
      assert.match(out.message, /invalid argument/);
    });

    it('isError with a NON-validation message → refresh NOT called, exit 1', async () => {
      const refresh = mock.fn(async () => ({}));
      const callTool = mock.fn(async () => ({
        isError: true,
        content: [{ type: 'text', text: 'memory not found' }],
      }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => API,
        refresh,
      });

      await action({ query: 'q' }, null);

      assert.strictEqual(refresh.mock.calls.length, 0, 'no refresh on a non-schema error');
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1, 'still exits 1');
      const out = getErrorOutput(mocks.logMock);
      assert.match(out.message, /memory not found/);
    });

    it('callTool throws with code -32602 (InvalidParams) → refresh(apiBase) called', async () => {
      const refresh = mock.fn(async () => ({}));
      const callTool = mock.fn(async () => {
        const err = new Error('Invalid params');
        err.code = -32602;
        throw err;
      });
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => API,
        refresh,
      });

      await action({ query: 'q' }, null);

      assert.strictEqual(refresh.mock.calls.length, 1, 'refresh called on -32602');
      assert.strictEqual(refresh.mock.calls[0].arguments[0], API);
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1, 'still exits 1');
    });

    it('callTool throws a non-validation (network) error → refresh NOT called', async () => {
      const refresh = mock.fn(async () => ({}));
      const callTool = mock.fn(async () => {
        throw new Error('network down');
      });
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => API,
        refresh,
      });

      await action({ query: 'q' }, null);

      assert.strictEqual(refresh.mock.calls.length, 0, 'no refresh on a network error');
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
      const out = getErrorOutput(mocks.logMock);
      assert.match(out.message, /network down/);
    });

    it('a successful call does NOT refresh', async () => {
      const refresh = mock.fn(async () => ({}));
      const callTool = mock.fn(async () => ({ results: [] }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => API,
        refresh,
      });

      await action({ query: 'q' }, { parent: null, opts: () => ({}) });

      assert.strictEqual(refresh.mock.calls.length, 0, 'no refresh on success');
      assert.strictEqual(mocks.exitMock.mock.calls.length, 0, 'no error exit on success');
    });

    it('a client-side invalid-args rejection does NOT refresh (never reaches callTool)', async () => {
      const refresh = mock.fn(async () => ({}));
      const callTool = mock.fn(async () => ({ ok: true }));
      const validate = mock.fn(() => ({
        valid: false,
        errors: ['must have required property query'],
      }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate,
        getBase: () => API,
        refresh,
      });

      await action({}, null);

      assert.strictEqual(callTool.mock.calls.length, 0, 'callTool never reached');
      assert.strictEqual(refresh.mock.calls.length, 0, 'no refresh on a client-side rejection');
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1, 'exit 1');
    });
  });

  // =========================================================================
  // Happy path (AC5/AC12/AC14): valid args reach callTool once + output prints
  // =========================================================================
  describe('happy path', () => {
    const mocks = setupCommandMocks();

    it('valid args call callMcpTool once with serverName + assembled arguments', async () => {
      const callTool = mock.fn(async () => ({ results: ['a'] }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => 'https://spark.memco.ai',
      });

      const command = { parent: null, opts: () => ({}) };
      await action({ query: 'rust async', limit: '3', scope: 'team' }, command);

      assert.strictEqual(callTool.mock.calls.length, 1, 'callTool invoked exactly once');
      const [apiBase, serverName, argsObject, passedCommand] = callTool.mock.calls[0].arguments;
      assert.strictEqual(apiBase, 'https://spark.memco.ai');
      assert.strictEqual(serverName, 'search', 'authoritative verbatim serverName');
      assert.deepStrictEqual(argsObject, { query: 'rust async', limit: 3, scope: 'team' });
      assert.strictEqual(passedCommand, command, 'command forwarded for --pretty resolution');

      // result printed via output() → compact JSON (no --pretty)
      assert.strictEqual(mocks.exitMock.mock.calls.length, 0, 'no error exit on success');
      const printed = JSON.parse(getLogOutput(mocks.logMock));
      assert.deepStrictEqual(printed, { results: ['a'] });
    });

    it('honors --pretty (parent opts) for result rendering', async () => {
      const callTool = mock.fn(async () => ({ results: ['x'] }));
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => 'https://spark.memco.ai',
      });

      // parent opts carry pretty:true (output walks up via getParentOptions)
      const parent = { parent: null, opts: () => ({ pretty: true }) };
      const command = { parent, opts: () => ({}) };
      await action({ query: 'q' }, command);

      assert.strictEqual(mocks.exitMock.mock.calls.length, 0);
      // pretty path renders via prettyPrint (not raw JSON) — assert it is NOT compact JSON
      const printed = getLogOutput(mocks.logMock);
      assert.doesNotMatch(printed, /^\{"results"/, 'pretty output is not compact JSON');
      assert.match(printed, /results|x/i);
    });

    it('routes a thrown callTool error through outputError → exit 1', async () => {
      const callTool = mock.fn(async () => {
        throw new Error('network down');
      });
      const action = makeToolAction(queryTool, {
        callTool,
        validate: okValidate,
        getBase: () => 'https://spark.memco.ai',
      });

      await action({ query: 'q' }, null);
      assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
      const out = getErrorOutput(mocks.logMock);
      assert.match(out.message, /network down/);
    });
  });

  // =========================================================================
  // AC14 — reuse the shared tag-validation helpers against a tags-declaring tool
  // =========================================================================
  describe('tag validation on a tags-declaring tool (AC14)', () => {
    const mocks = setupCommandMocks();

    // Build a commander-style action over create_memory (declares `tags`, --query).
    // The validator/callTool never matter here: invalid tags throw inside buildArgs,
    // BEFORE validation/callTool, and are funneled through outputError (exit 1).
    const action = makeToolAction(shareTaskTool, {
      callTool: mock.fn(async () => ({ ok: true })),
      validate: okValidate,
      getBase: () => 'https://spark.memco.ai',
    });

    // The helper calls commandFn(args[0], { ...args[1], tag/xmlTag }, null). Since
    // makeToolAction now reads options = handlerArgs[length-2], the merged opts object
    // (2nd arg) is what reaches buildArgs — so put the base opts (with --query) there.
    const buildHelperArgs = () => [undefined, { query: 'a task summary' }];

    tagValidationTests(mocks, action, buildHelperArgs);
    xmlTagValidationTests(mocks, action, buildHelperArgs);
  });

  // =========================================================================
  // registration / empty-cache hint (FR3)
  // =========================================================================
  describe('registerToolCommands', () => {
    it('registers one subcommand per cached tool under the verbatim serverName', () => {
      const program = new Command('spark');
      registerToolCommands(program, [queryTool, shareTaskTool], {
        callTool: mock.fn(),
        validate: okValidate,
        getBase: () => 'https://spark.memco.ai',
      });
      const names = program.commands.map((c) => c.name());
      assert.deepStrictEqual(names, ['search', 'create_memory']);
      // and the tool description is applied
      const q = program.commands.find((c) => c.name() === 'search');
      assert.strictEqual(q.description(), 'Query the knowledge network');
    });

    it('sets a concise .summary() (first sentence) while keeping the full .description()', () => {
      const verboseTool = {
        serverName: 'search',
        description:
          'Search the knowledge network for solutions. This is a much longer paragraph ' +
          'that explains every detail of the tool, spanning multiple sentences.\n\n' +
          'It even has a second paragraph with more context that should NOT appear in the ' +
          'top-level summary line.',
        inputSchema: { type: 'object', properties: {} },
      };
      const program = new Command('spark');
      registerToolCommands(program, [verboseTool], {
        callTool: mock.fn(),
        validate: okValidate,
        getBase: () => 'https://spark.memco.ai',
      });
      const cmd = program.commands.find((c) => c.name() === 'search');

      // summary is the first sentence of the first line only
      assert.strictEqual(cmd.summary(), 'Search the knowledge network for solutions.');
      // the full multi-paragraph description is preserved for `spark <cmd> --help`
      assert.strictEqual(cmd.description(), verboseTool.description);

      // the parent listing shows the short summary, not the full description
      let parentHelp = '';
      program.configureOutput({ writeOut: (s) => (parentHelp += s) });
      program.outputHelp();
      assert.match(parentHelp, /Search the knowledge network for solutions\./);
      assert.doesNotMatch(parentHelp, /second paragraph/);

      // the per-command help still shows the full description
      const fullHelp = cmd.helpInformation();
      assert.match(fullHelp, /second paragraph with more context/);
    });

    it('falls back gracefully when the first description line is a single sentence', () => {
      const program = new Command('spark');
      registerToolCommands(program, [queryTool], {
        callTool: mock.fn(),
        validate: okValidate,
        getBase: () => 'https://spark.memco.ai',
      });
      const cmd = program.commands.find((c) => c.name() === 'search');
      // queryTool.description has no terminal punctuation → whole first line is the summary
      assert.strictEqual(cmd.summary(), 'Query the knowledge network');
    });

    it('registers no dynamic commands and shows the login hint on an empty manifest', () => {
      const program = new Command('spark');
      registerToolCommands(program, []);
      assert.strictEqual(program.commands.length, 0, 'no dynamic commands registered');

      // The hint is added via addHelpText('after', …), which does NOT appear in
      // helpInformation(); capture it via outputHelp() + configureOutput.
      let helpText = '';
      program.configureOutput({ writeOut: (s) => (helpText += s) });
      program.outputHelp();
      assert.match(helpText, /Run 'spark login' or 'spark init' to load available commands/);
    });

    it('shows the same hint when tools is not an array', () => {
      const program = new Command('spark');
      registerToolCommands(program, undefined);
      let helpText = '';
      program.configureOutput({ writeOut: (s) => (helpText += s) });
      program.outputHelp();
      assert.match(helpText, /Run 'spark login'/);
    });

    it('end-to-end: a registered command parses flags and invokes callTool with serverName', async () => {
      const callTool = mock.fn(async () => ({ ok: 1 }));
      const logSpy = mock.method(console, 'log', () => {});
      const exitSpy = mock.method(process, 'exit', () => {});
      try {
        const program = new Command('spark');
        program.exitOverride();
        registerToolCommands(program, [queryTool], {
          callTool,
          validate: okValidate,
          getBase: () => 'https://spark.memco.ai',
        });
        await program.parseAsync(['search', '--query', 'hello', '--limit', '2'], {
          from: 'user',
        });
        assert.strictEqual(callTool.mock.calls.length, 1);
        const [, serverName, argsObject] = callTool.mock.calls[0].arguments;
        assert.strictEqual(serverName, 'search');
        assert.deepStrictEqual(argsObject, { query: 'hello', limit: 2 });
      } finally {
        logSpy.mock.restore();
        exitSpy.mock.restore();
      }
    });

    it('end-to-end: a multi-word snake_case flag round-trips through a registered command', async () => {
      const callTool = mock.fn(async () => ({ ok: 1 }));
      const logSpy = mock.method(console, 'log', () => {});
      const exitSpy = mock.method(process, 'exit', () => {});
      try {
        const program = new Command('spark');
        program.exitOverride();
        registerToolCommands(program, [feedbackTool], {
          callTool,
          validate: okValidate,
          getBase: () => 'https://spark.memco.ai',
        });
        await program.parseAsync(
          ['share_feedback', '--session-id', 'sess-9', '--memory-idx', '2'],
          { from: 'user' },
        );
        assert.strictEqual(callTool.mock.calls.length, 1);
        const [, serverName, argsObject] = callTool.mock.calls[0].arguments;
        assert.strictEqual(serverName, 'share_feedback');
        assert.deepStrictEqual(argsObject, { session_id: 'sess-9', memory_idx: 2 });
      } finally {
        logSpy.mock.restore();
        exitSpy.mock.restore();
      }
    });
  });
});
