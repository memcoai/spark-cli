# Spark CLI

Always keep this file up to date. Update it on approved changes to always reflect the current state.

## Agent Rules

Always use Spark MCP tools to query shared memory **before** coding. Spark MCP provides software development guidance, including internal policies and best practice used in my team, information about proprietary code, and shared problem-solving knowledge from my software development team.

1. Call `mcp__spark__get_recommendation` with an environment scan and task tags to search existing knowledge,
2. then call `mcp__spark__get_insights` to get any information relevant to your task.
3. If you discover anything new, call `mcp__spark__share_insight` to share it with the rest of the team.
4. **Always** call `mcp__spark__share_feedback` before finishing if you received any information from Spark.

## Project Overview

Node.js CLI tool (`@memco/spark`) that provides a command-line interface to the Spark knowledge network — a collective memory system for AI coding agents. ES modules throughout (`"type": "module"`), requires Node >= 18.

## Architecture

```
bin/spark.js          CLI entry point (commander.js), version check hooks
src/
  commands/
    auth.js           login (OAuth PKCE), logout, whoami
    query.js          Query knowledge network (get_recommendation)
    insights.js       Get detailed insights for a task
    share.js          Share an insight/solution
    feedback.js       Provide feedback on recommendations
    update.js         Self-update command (npm install -g @memco/spark@latest)
    uninstall.js      Self-uninstall command (npm uninstall -g @memco/spark)
    init.js           Interactive IDE setup wizard (Claude Code, Cursor/Windsurf); persists choices to settings; exports shared setup helpers
    enable.js         Enable Spark for the current project (project-scoped init without scope prompt); reuses init helpers
    disable.js        Disable Spark for the current project (reverse of enable); reuses uninstall helpers
    status.js         Status check — version freshness, auth verification, and skills version
  exec.js             Shared child process helpers (runCommand, runInteractiveCommand)
  api.js              HTTP client — getAuthToken, apiRequest, callTool, and API wrappers
  oauth.js            OAuth discovery (well-known endpoints) and dynamic client registration
  credentials.js      Load/save/remove credentials via settings.json
  settings.js         Low-level settings.json read/write helpers
  update-check.js     Version checking (npm update notifications), backend compatibility (block/deprecation), and skills version checking
  constants.js        Shared constants (API_BASE, VERSION_CHECK_URL, SKILLS_VERSION_URL, paths, port, auth redirect URLs)
  output.js           Output helpers (getParentOptions, output, outputError, outputSuccess, version notification)
  format-markdown.js  Lightweight markdown-to-ANSI terminal renderer
  pretty-print.js     Human-readable object renderer for --pretty mode
  parse-tags.js       Tag parsing/validation (TYPE:NAME or TYPE:NAME:VERSION)
  banner.js           Terminal UI (logos, spinners, colored output via colorize())
  index.js            Public API re-exports from api.js
```

## Key Patterns

- **Settings file:** All persistent state stored in `settings.json` with structure `{ credentials, client, latestVersion, compatibility, skillsVersion, projects, globalInit }`. Global at `~/.spark/settings.json`, local at `./.spark/settings.json`. Credentials and client data use `readSettingsKey`/`writeSettingsKey` from `settings.js`.
- **Credentials resolution:** local-first (`./.spark/settings.json`) then global (`~/.spark/settings.json`). The `--local` flag on `spark login` scopes credentials to the current directory. Token refresh auto-detects which location to save back to. Logout removes the `credentials` key, not the file.
- **Auth priority:** CLI `--api-key` flag > `SPARK_API_KEY` env var > OAuth access token > legacy API key in credentials file.
- **Tag format:** `TYPE:NAME` or `TYPE:NAME:VERSION` where version accepts MAJOR, MAJOR.MINOR, or MAJOR.MINOR.PATCH with optional pre-release suffix. The `v` prefix is stripped. Backend handles semantic validation; CLI only validates structure.
- **Output:** Default output is compact JSON via `output()`. Use `--pretty` for human-readable output with markdown rendering and ANSI formatting. Auth commands (login, logout) always use styled terminal output via banner.js. Errors go through `outputError()` which calls `process.exit(1)`.
- **OAuth client cache:** stored in `~/.spark/settings.json` under the `client` key (global, not per-project).
- **Version checking:** Three separate systems: (1) npm registry check for "update available" notifications — cached under `latestVersion` with 24-hour TTL; (2) backend compatibility check (`GET /api/cli/compatibility`) for blocking outdated CLIs and deprecation warnings — cached under `compatibility` with 4-hour TTL; (3) skills version check from GitHub raw content (`memcoai/spark-cli-skills/main/VERSION`) — cached under `skillsVersion` with 24-hour TTL. All fail open on network errors. Skills notifications include IDE-specific update commands based on stored init choices.
- **Init persistence:** `spark init` saves IDE choices and installed skills version. Project scope writes `init` to local `.spark/settings.json` AND upserts into global `projects` array. Global scope writes `globalInit` to `~/.spark/settings.json`. Version checks read local `init` first, then fall back to `globalInit`.

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
- CI: GitHub Actions on main/dev, matrix Node [18, 20, 22], lint on Node 22 only
- **Always run `npm run format` after making changes** to ensure consistent code style

## Test Structure

```
test/
  helpers.js                  Shared test helpers (setupCommandMocks, getErrorOutput)
  parse-tags.test.js          parseTags, parseSources
  credentials.test.js         isTokenExpired
  settings.test.js            readSettings, writeSettings, readSettingsKey, writeSettingsKey
  update-check.test.js        evaluateCompatibility, getSkillsNotification
  output.test.js              getParentOptions, output, outputSuccess, printVersionNotification
  format-markdown.test.js     Markdown-to-ANSI rendering
  pretty-print.test.js        Human-readable object formatting
  commands/
    query.test.js             Tag validation errors
    share.test.js             Tag/version validation errors
    insights.test.js          taskIndex validation
    feedback.test.js          Flag validation (--helpful / --not-helpful)
    uninstall.test.js         npm uninstall execution and error handling
    init.test.js              IDE selection, scope, command execution, init persistence
    status.test.js            Version check, auth verification, and skills version status
```

Tests cover input parsing and validation without external service dependencies. Command tests mock `console.log` and `process.exit` to verify error output without hitting the API.
