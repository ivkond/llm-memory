# Phase 2: MCP Read Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 2-mcp-read-tools
**Areas discussed:** Tool schemas, Response shapes, Error handling, Search scope

---

## Tool Schemas

| Option | Description | Selected |
|--------|-------------|----------|
| QueryService-aligned | { query: string, project?: string, scope?: string } | ✓ |
| Custom MCP shape | Different params optimized for MCP context | |

**User's choice:** Reasonable defaults — align with existing service interfaces
**Notes:** Keep MCP params matching service method signatures for direct pass-through

---

## Response Shapes

| Option | Description | Selected |
|--------|-------------|----------|
| Envelope pattern | { success: true/false, data/error } | ✓ |
| Direct return | Raw service response | |

**User's choice:** Reasonable defaults — envelope pattern for consistency
**Notes:** Each tool returns envelope with data or error field

---

## Error Handling

| Option | Description | Selected |
|--------|-------------|----------|
| MCP error codes | Map to InvalidParams/InternalError | ✓ |
| Response-body errors | Always 200, embed errors in body | |

**User's choice:** Reasonable defaults — MCP error codes with graceful degradation preserved
**Notes:** wiki_query keeps INV-3 behavior (raw citations on LLM failure)

---

## Search Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Optional scope param | Explicit override, falls back to cwd detection | ✓ |
| Always explicit | Require scope param | |
| Auto-detect only | No param, always from cwd | |

**User's choice:** Reasonable defaults — optional scope param with cascade fallback
**Notes:** Scope cascade: explicit → project → wiki → all

---

## Claude's Discretion

- Tool naming convention (wiki_* prefix) — already established
- Response envelope fields — standardized across all tools
