# Spark CLI

Always keep this file up to date. Update it on approved changes to always reflect the current state.

## Agent Rules

Always use Spark MCP tools to query shared memory **before** coding. Spark MCP provides software development guidance, including internal policies and best practice used in my team, information about proprietary code, and shared problem-solving knowledge from my software development team.

1. Call `mcp__spark__get_recommendation` with an environment scan and task tags to search existing knowledge,
2. then call `mcp__spark__get_insights` to get any information relevant to your task.
3. If you discover anything new, call `mcp__spark__share_insight` to share it with the rest of the team.
4. **Always** call `mcp__spark__share_feedback` before finishing if you received any information from Spark.