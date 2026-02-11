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
bin/spark.js          CLI entry point (commander.js)
src/
  commands/
    auth.js           login (OAuth PKCE), logout, whoami
    query.js          Query knowledge network (get_recommendation)
    insights.js       Get detailed insights for a task
    share.js          Share an insight/solution
    feedback.js       Provide feedback on recommendations
  api.js              HTTP client — getAuthToken, apiRequest, callTool, and API wrappers
  oauth.js            OAuth discovery (well-known endpoints) and dynamic client registration
  credentials.js      Load/save/remove credentials (local .spark/ or global ~/.spark/)
  constants.js        Shared constants (API_BASE, paths, port)
  output.js           JSON output helpers (getParentOptions, output, outputError, outputSuccess)
  parse-tags.js       Tag parsing/validation (TYPE:NAME or TYPE:NAME:VERSION)
  banner.js           Terminal UI (logos, spinners, colored output via colorize())
  index.js            Public API re-exports from api.js
```

## Key Patterns

- **Credentials resolution:** local-first (`./.spark/credentials.json`) then global (`~/.spark/credentials.json`). The `--local` flag on `spark login` scopes credentials to the current directory. Token refresh auto-detects which location to save back to.
- **Auth priority:** CLI `--api-key` flag > `SPARK_API_KEY` env var > OAuth access token > legacy API key in credentials file.
- **Tag format:** `TYPE:NAME` or `TYPE:NAME:VERSION` where version accepts MAJOR, MAJOR.MINOR, or MAJOR.MINOR.PATCH with optional pre-release suffix. The `v` prefix is stripped. Backend handles semantic validation; CLI only validates structure.
- **Output:** All command output is JSON via `output()`. Use `--pretty` for indented output. Errors go through `outputError()` which calls `process.exit(1)`.
- **OAuth client cache:** stored globally at `~/.spark/oauth-client.json` (per-CLI, not per-project).

## Development

```
npm test              # node --test (auto-discovers test/ directory)
npm run test:coverage # c8 coverage report
npm run lint          # eslint src/
```

- Test framework: `node:test` built-in runner with `node:assert/strict`
- Mocking: `mock.method()` from `node:test` for `console.log` and `process.exit` in command tests
- Coverage: `c8`
- Linting: ESLint 9 flat config (`eslint.config.js`)
- CI: GitHub Actions on main/dev, matrix Node [18, 20, 22], lint on Node 22 only

## Test Structure

```
test/
  parse-tags.test.js          parseTags, parseSources
  credentials.test.js         isTokenExpired
  output.test.js              getParentOptions, output, outputSuccess
  commands/
    query.test.js             Tag validation errors
    share.test.js             Tag/version validation errors
    insights.test.js          taskIndex validation
    feedback.test.js          Flag validation (--helpful / --not-helpful)
```

Tests cover input parsing and validation without external service dependencies. Command tests mock `console.log` and `process.exit` to verify error output without hitting the API.
