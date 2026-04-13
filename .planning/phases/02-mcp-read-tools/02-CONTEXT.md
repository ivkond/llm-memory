# Phase 2: MCP Read Tools - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose read-only MCP tools (wiki_query, wiki_recall, wiki_status) so agents can query wiki, recall context, and check status without modifying any data.

</domain>

<decisions>
## Implementation Decisions

### Tool Schemas
- **D-01:** `wiki_query` accepts `{ query: string, project?: string, scope?: string }` — aligns with QueryService interface
- **D-02:** `wiki_recall` accepts `{ project?: string, max_tokens?: number }` — aligns with RecallService interface  
- **D-03:** `wiki_status` accepts `{ project?: string }` — aligns with WikiStatusService interface

### Response Shapes
- **D-04:** Each tool returns `{ success: true, data: T }` on success, `{ success: false, error: string, code?: string }` on failure — consistent envelope pattern
- **D-05:** wiki_query returns `{ answer: string, citations: SearchResult[] }` — LLM synthesis + raw citations on failure
- **D-06:** wiki_recall returns `{ project, pages, unconsolidated_count, total_pages }` — matches RecallService response
- **D-07:** wiki_status returns `{ pages, projects, unconsolidated, index_health, last_lint, last_ingest }` — matches WikiStatusService response

### Error Handling
- **D-08:** Service errors mapped to MCP error codes — InvalidParams for input validation, InternalError for service failures
- **D-09:** Graceful degradation preserved — wiki_query returns raw citations on LLM failure (INV-3)

### Search Scope
- **D-10:** Optional explicit `scope` param on wiki_query — falls back to project detection from cwd
- **D-11:** Scope cascade: explicit → project → wiki → all (empty string)

### Claude's Discretion
- Tool naming convention (wiki_* prefix) — already established in Phase 1
- Response envelope fields — standardized across all tools

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Service Interfaces
- `packages/core/src/services/query-service.ts` — QueryService interface
- `packages/core/src/services/recall-service.ts` — RecallService interface
- `packages/core/src/services/status-service.ts` — WikiStatusService interface

### MCP Patterns
- `packages/mcp-server/src/tools/schemas.ts` — existing schema definitions
- `packages/mcp-server/src/tools/wiki-query.ts` — current stub

### Project Context
- `.planning/ROADMAP.md` §Phase 2 — success criteria
- `.planning/REQUIREMENTS.md` — MCP-02, MCP-03, MCP-08

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- QueryService, RecallService, WikiStatusService already implemented in core
- Stub handlers exist in packages/mcp-server/src/tools/
- Schema definitions already in schemas.ts

### Established Patterns
- MCP tool handlers created via factory functions (`createWikiXxxHandler`)
- AppServices dependency injection from common package

### Integration Points
- Wire handlers to real service calls via AppServices
- Use existing tool registration in server.ts

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches aligned with service interfaces.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-mcp-read-tools*
*Context gathered: 2026-04-13*