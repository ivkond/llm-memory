# ADR-0015: Seven MCP Tools

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/phases/01-composition-root-and-mcp-bootstrap/01-CONTEXT.md`
  - `.planning/phases/02-mcp-read-tools/02-01-SUMMARY.md`
  - `.planning/phases/03-mcp-write-tools/03-01-SUMMARY.md`
  - `.planning/REQUIREMENTS.md`

## Context

MCP is the primary agent-facing transport. The tool surface must stay small enough for agents to use reliably while exposing all v1 capabilities.

## Decision

Expose seven canonical MCP tools: `wiki_query`, `wiki_recall`, `wiki_remember_fact`, `wiki_remember_session`, `wiki_ingest`, `wiki_lint`, and `wiki_status`. Tool names and schemas are stable; handlers call core services through `AppServices`.

## Consequences

- MCP clients can rely on a stable `tools/list` contract.
- New capabilities should not be added as extra tools without a new decision or versioning strategy.
- Claude Code `/wiki` guidance must explain tools, not duplicate them.

## Alternatives considered

- More granular tools: rejected due to tool overload and prompt budget dilution.
- One generic tool: rejected because it would hide schema and intent from agents.
- Separate Claude-specific tools: rejected to avoid duplicated surfaces.

## Implementation notes

The MCP server registers the seven tools in `packages/mcp-server/src/tools/`.

## Open questions

None.
