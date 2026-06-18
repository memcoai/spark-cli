# Spark CLI

Always keep this file up to date. Update it on approved changes to always reflect the current state.

## Agent Rules

Always use Spark MCP tools to query shared memory **before** coding. Spark MCP provides software development guidance, including internal policies and best practice used in my team, information about proprietary code, and shared problem-solving knowledge from my software development team.

1. Call `mcp__spark__search` with tags describing your context to search existing knowledge.
2. If you discover anything new, call `mcp__spark__enrich_memory` to share it with the rest of the team.
3. **Always** call `mcp__spark__share_feedback` before finishing if you received any information from Spark.

## Project Overview

Node.js CLI tool (`@memco/spark`) that provides a command-line interface to the Spark knowledge network — a collective memory system for AI coding agents. ES modules throughout (`"type": "module"`), requires Node >= 20.17.

## Getting Started

Spark installs as a plugin from the MemCo marketplace (`memcoai/marketplace`) for Claude Code, Codex, and Cursor, backed by the `spark` CLI.

1. **Install the CLI:** `npm install -g @memco/spark`
2. **Login:** `spark login` (opens browser for OAuth authentication)
3. **Init:** `spark init` (interactive IDE setup wizard — adds the marketplace, detects the variant (public/teams), and installs the matching plugin + skills for Claude Code, Cursor, Windsurf, etc.)
4. **Verify:** `spark status` (checks version, auth, and skills status)

**Manual plugin install:** Claude Code — `/plugin marketplace add memcoai/marketplace` then `/plugin install spark-cli@MemCo` (teams: `spark-team-cli@MemCo`). Codex — `codex plugin marketplace add memcoai/marketplace` then `codex plugin add spark-cli@MemCo`. Cursor — Dashboard → Settings → Plugins → Add Marketplace → Import from Repo → `memcoai/marketplace`. The marketplace also hosts the MCP variants `spark-mcp` / `spark-team-mcp`.

**Updating:** `spark update` updates both the CLI and skills for all configured IDEs.

## Architecture

```
bin/spark.js          CLI entry point (commander.js), version check hooks
src/
  commands/
    auth.js           login (OAuth PKCE), logout, whoami; exports resolveApiBase for testable --api-base handling
    query.js          Query knowledge network (search)
    share.js          Share an insight/solution
    share-task.js     Share task insights with knowledge network (create_memory)
    feedback.js       Provide feedback on recommendations (XML feedback entries with idx, relevant, correct)
    update.js         Self-update command (CLI + skills); exports updateSkills for IDE-aware skills updating
    uninstall.js      Self-uninstall command; cleans up all init targets (local, global, and registered projects) before npm uninstall
    init.js           Interactive IDE setup wizard (Claude Code, Codex, Cursor/Windsurf); persists choices to settings; exports runSetupFlow and shared helpers (setupClaudeCode, setupCodex, setupOtherIDEs)
    enable.js         Enable Spark for the current project; delegates to runSetupFlow from init.js with scope='project'
    disable.js        Disable Spark for the current project (reverse of enable); reuses uninstall helpers (Codex is global-only, so disable never removes it)
    status.js         Status check — version freshness, auth verification, and skills version
  exec.js             Shared child process helpers (runCommand, runInteractiveCommand)
  api.js              HTTP client — getAuthToken, apiRequest (with 401 retry via token refresh), callTool, and API wrappers
  oauth.js            OAuth discovery (well-known endpoints) and dynamic client registration
  credentials.js      Load/save/remove credentials via settings.json
  settings.js         Low-level settings.json read/write helpers
  update-check.js     Version checking (npm update notifications), backend compatibility (block/deprecation), and skills version checking
  constants.js        Shared constants (DEFAULT_API_BASE, getApiBase(), VARIANTS, getMarketplaceName(), VERSION_CHECK_URL, SKILLS_VERSION_URL, paths, port, auth redirect URLs)
  output.js           Output helpers (getParentOptions, output, outputError, outputSuccess, version notification)
  format-markdown.js  Lightweight markdown-to-ANSI terminal renderer
  pretty-print.js     Human-readable object renderer for --pretty mode
  schemas.js          Zod schemas for all validation: command inputs (query, share, share-task, feedback), CLI inputs (tags, XML tags), OAuth responses (token, discovery, registration), settings.json structure, and API responses
  parse-tags.js       Tag parsing/validation (TYPE:NAME or TYPE:NAME:VERSION), XML tag validation (parseXmlTags), XML conversion (tagsToXml), and merged tag collection (collectTags) — uses Zod schemas from schemas.js
  banner.js           Terminal UI (logos, spinners, colored output via colorize())
  index.js            Public API re-exports from api.js
```

## Key Patterns

- **Zod validation:** All input validation and response parsing uses Zod schemas defined in `src/schemas.js`. CLI inputs (tags, feedback flags), OAuth responses (token exchange, discovery metadata), API responses, settings.json reads, and version check responses are all validated through Zod. Use `z.looseObject(...)` on API/external response schemas to tolerate extra fields. Use `.safeParse()` with fail-open semantics for non-critical paths (version checks, settings reads). Use `.parse()` for critical paths (token exchange, API calls). When adding new schemas, preserve existing error messages by using `ctx.addIssue()` in `.transform()`.
- **Avoid code duplication:** Extract shared logic into reusable helpers rather than duplicating code across commands. For example, `enable.js` and `disable.js` reuse helpers exported from `init.js` and `uninstall.js` respectively. When adding new commands or features, check for existing utilities before writing new code.
- **Settings file:** All persistent state stored in `settings.json` with structure `{ apiBase, credentials, clients, latestVersion, compatibility, skillsVersion, projects, globalInit }`. Global at `~/.spark/settings.json`, local at `./.spark/settings.json`. Credentials and client data use `readSettingsKey`/`writeSettingsKey` from `settings.js`.
- **API base URL:** Resolved via `getApiBase()` from `constants.js`. Priority: `SPARK_API_BASE` env var > local `apiBase` setting > global `apiBase` setting > `DEFAULT_API_BASE` (`https://spark.memco.ai`). Can be set via `spark login --api-base <url>` (persists to settings.json; `--local` controls which file). This is a developer-only feature.
- **Per-URL credentials:** Credentials are stored keyed by API base URL: `{ credentials: { "https://spark.memco.ai": { accessToken, ... } } }`. Old flat credentials are lazily migrated to per-URL format under `DEFAULT_API_BASE`. All credential functions accept an optional `apiBase` parameter, defaulting to `getApiBase()`.
- **Per-URL OAuth clients:** OAuth client registrations are stored per URL under `clients` key: `{ clients: { "https://spark.memco.ai": { client_id, ... } } }`. Old flat `client` key is migrated to `clients[DEFAULT_API_BASE]`. OAuth metadata is cached per URL in a Map.
- **Credentials resolution:** local-first (`./.spark/settings.json`) then global (`~/.spark/settings.json`). The `--local` flag on `spark login` scopes credentials to the current directory. Token refresh auto-detects which location to save back to. Logout removes the credentials for the active API base URL, not the file.
- **Auth priority:** CLI `--api-key` flag > `SPARK_API_KEY` env var > OAuth access token > legacy API key in credentials file.
- **Token refresh:** Two-layer strategy: (1) **proactive** — `getAuthToken()` checks `isTokenExpired()` (5-min buffer) and refreshes before each API call; (2) **reactive** — `apiRequest()` catches 401 responses for OAuth tokens, refreshes once, and retries. Both save the new token back to the same settings.json file the credentials were loaded from. API key auth (not OAuth) is never retried on 401.
- **Post-login verification:** After saving credentials, `loginCommand` calls `getCurrentUser()` to verify the login succeeded (response < 400). Verification failure shows a warning but does not abort login.
- **Tag format:** Two input formats, both repeatable. `--tag TYPE:NAME` or `--tag TYPE:NAME:VERSION` accepts colon-separated tags (e.g., `--tag language:python:3.11`). `--xml-tag` accepts pre-formed XML tags (e.g., `--xml-tag '<tag type="language" name="python" version="3.11" />'`). Both can be used together. Version in `--tag` accepts MAJOR, MAJOR.MINOR, or MAJOR.MINOR.PATCH with optional pre-release suffix; `v` prefix is stripped. `--xml-tag` validates required `type` and `name` attributes, optional `version`, rejects unknown attributes, and normalizes to canonical attribute order. Command handlers use `collectTags(options)` from `parse-tags.js` to merge `--tag` and `--xml-tag` into a single XML tags array, sent as the `tags` parameter on tool endpoints that accept tags (search, enrich_memory, create_memory). Endpoints that do not accept tags (e.g., share_feedback) do not receive this parameter.
- **Output:** Default output is compact JSON via `output()`. Use `--pretty` for human-readable output with markdown rendering and ANSI formatting. Auth commands (login, logout) always use styled terminal output via banner.js. Errors go through `outputError()` which calls `process.exit(1)`.
- **OAuth client cache:** stored in `~/.spark/settings.json` under the `clients` key, keyed by API base URL.
- **Version checking:** Three separate systems: (1) npm registry check for "update available" notifications — cached under `latestVersion` with 24-hour TTL; (2) backend compatibility check (`GET /api/cli/compatibility`) for blocking outdated CLIs and deprecation warnings — cached under `compatibility` with 4-hour TTL; (3) skills version check from GitHub raw content (`memcoai/spark-cli-skills/main/VERSION`) — cached under `skillsVersion` with 24-hour TTL. All fail open on network errors. Skills notifications include IDE-specific update commands based on stored init choices.
- **Init persistence:** `spark init` saves IDE choices and installed skills version. Project scope writes `init` to local `.spark/settings.json` AND upserts into global `projects` array. Global scope writes `globalInit` to `~/.spark/settings.json`. Version checks read local `init` first, then fall back to `globalInit`.
- **Global-only IDEs (Codex):** IDE keys in `GLOBAL_ONLY_IDES` (`constants.js`, currently `['codex']`) install plugins that have no project/user scope. They are ALWAYS recorded in `globalInit` (merged with any existing entry) regardless of the chosen install scope — never in local `init` or the `projects` array — so a single global record governs install/removal. Consequently a project-scoped `spark disable` never tears down Codex; it is shared across projects and removed only by `spark uninstall`. `setupCodex`/`uninstallCodexPlugin` take no scope; `spark init` prints a note when Codex is selected with project scope.

## Development

```
npm test              # node --test (auto-discovers test/ directory)
npm run test:coverage # c8 coverage report
npm run lint          # eslint src/
npm run format        # eslint --fix src/
```

- Test framework: `node:test` built-in runner with `node:assert/strict`
- Mocking: `mock.method()` from `node:test` for `console.log` and `process.exit` in command tests
- Test helpers: `test/helpers.js` provides `setupCommandMocks()` and `getErrorOutput()`
- Coverage: `c8`
- Linting: ESLint 9 flat config (`eslint.config.js`)
- CI: GitHub Actions on main/dev, matrix Node [20, 22, 24], lint on Node 24 only. CI/publish jobs upgrade to npm >= 11.11 so the `.npmrc` `min-release-age` setting is respected
- **Always run `npm run format` after making changes** to ensure consistent code style

## Test Structure

```
test/
  helpers.js                  Shared test helpers (setupCommandMocks, setupFetchMock, getErrorOutput, tagValidationTests, xmlTagValidationTests, mockFetchSequence, buildApiRequestDeps)
  schemas.test.js             Zod schema unit tests (tags, XML tags, feedback, token response normalization, OAuth discovery, settings, API responses)
  api.test.js                 apiRequest 401 retry with token refresh (OAuth retry, API key no-retry, refresh failure)
  parse-tags.test.js          parseTags, tagsToXml, parseXmlTags, collectTags, parseSources
  constants.test.js            getApiBase (env var override, default fallback)
  credentials.test.js         isTokenExpired
  settings.test.js            readSettings, writeSettings, readSettingsKey, writeSettingsKey
  update-check.test.js        evaluateCompatibility, getSkillsNotification
  output.test.js              getParentOptions, output, outputSuccess, printVersionNotification
  format-markdown.test.js     Markdown-to-ANSI rendering
  pretty-print.test.js        Human-readable object formatting
  commands/
    auth.test.js              checkExistingAuth (credential checks, token refresh, --local flag)
    query.test.js             Tag and XML tag validation, API call tag serialization
    share.test.js             Tag and XML tag validation, API call tag serialization
    share-task.test.js        Tag and XML tag validation, API call tag serialization
    feedback.test.js          XML feedback entry validation (--feedback flag)
    update.test.js            CLI self-update and skills update (IDE detection, version save, failure handling)
    uninstall.test.js         npm uninstall execution and error handling
    init.test.js              IDE selection, scope, command execution, init persistence
    enable.test.js            Verifies project scope is always used (delegates to runSetupFlow)
    disable.test.js           Project-scoped teardown, plugin/skills removal, init cleanup
    status.test.js            Version check, auth verification, and skills version status
```

Tests cover input parsing and validation without external service dependencies. Command tests mock `console.log` and `process.exit` to verify error output without hitting the API.
