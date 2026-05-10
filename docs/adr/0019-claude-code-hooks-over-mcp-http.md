# ADR-0019: Claude Code Hooks over MCP HTTP

- Status: Accepted
- Date: 2026-05-10
- Supersedes: earlier wrapper-package design notes for Claude Code integration
- Source documents:
  - `.planning/phases/05-claude-code-integration/05-CONTEXT.md`
  - `.planning/phases/05-claude-code-integration/05-RESEARCH.md`
  - `.planning/phases/05-claude-code-integration/05-01-SUMMARY.md`
  - `.planning/REQUIREMENTS.md`

## Context

Claude Code sessions should automatically load relevant wiki context at start and persist session learnings at stop. The MCP HTTP server already exposes the needed tools.

## Decision

Claude Code integration uses command hooks that call the local MCP HTTP endpoint directly. `SessionStart` calls `wiki_recall` and injects a compact context preamble. `Stop` calls `wiki_remember_session` and must guard against stop-hook loops. `/wiki` is a guide skill/documentation surface that explains the MCP tools and workflow without duplicating tools.

## Consequences

- No wrapper package is required for the core integration path.
- Hooks depend on the MCP server being reachable on loopback.
- Hook failure should be non-blocking when MCP is unavailable.

## Alternatives considered

- Wrapper package with `recall`/`flush` commands: superseded as unnecessary complexity.
- MCP stdio for hooks: rejected as out of v1 scope.
- Native context injection without explicit preamble control: rejected due to weaker token-budget control.

## Implementation notes

Phase 5 planning records `.claude/settings.json`, hook scripts, and `.claude/skills/wiki/SKILL.md`. Current CLI also includes a generic `skill` manager under `.agent_context/skills`.

## Open questions

None. Release follow-up for verifying hook artifacts is tracked in `docs/ROADMAP.md`.
