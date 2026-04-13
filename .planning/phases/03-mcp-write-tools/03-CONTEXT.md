# Phase 3: MCP Write Tools - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose mutating MCP tools (wiki_remember_fact, wiki_remember_session, wiki_ingest, wiki_lint) so agents can store facts, record sessions, ingest sources, and run lint with full safety guarantees.

</domain>

<decisions>
## Implementation Decisions

### remember_fact (Sanitization)
- **D-01:** wiki_remember_fact uses sanitization mode **REDACT** — strip secrets, replace with [REDACTED]
- **D-02:** Input: `{ fact: string, project?: string, source?: string }` — aligns with RememberService interface
- **D-03:** Response: `{ entry_id: string, project: string, path: string }` — confirmation with written path

### remember_session (Deduplication)
- **D-04:** wiki_remember_session uses **APPEND** mode — allow duplicate session_id entries each time
- **D-05:** Input: `{ session_id: string, summary: string, project?: string, metadata?: object }`
- **D-06:** Response: `{ entry_id: string, session_id: string, created_at: string }`

### ingest (Error Handling)
- **D-07:** wiki_ingest implements **N retries (configurable), then rollback with error report**
- **D-08:** Retry on transient failures (network, parse) — N configurable, default 1
- **D-09:** On final failure: clean up worktree, report error with details
- **D-10:** Input: `{ source: string, project?: string, force?: boolean }` — file path or URL
- **D-11:** Response: `{ page_path: string, project: string, worktree_cleaned: boolean }`

### lint (Phase Selection)
- **D-12:** wiki_lint supports **all 3 phases**: consolidate, promote, health (INV-9)
- **D-13:** Default: run all phases unless `phase` param specifies subset
- **D-14:** Input: `{ phase?: string, project?: string }` — phase: "consolidate" | "promote" | "health" | "all"
- **D-15:** Response: `{ phases_run: string[], report: object, entries_consolidated: number, entries_promoted: number }`

### Claude's Discretion
- Retry N configurable via ConfigLoader (wiki.ingest.retries, default 1)
- Worktree naming convention — branch pattern from IngestService

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Service Interfaces
- `packages/core/src/services/remember-service.ts` — RememberService interface
- `packages/core/src/services/ingest-service.ts` — IngestService interface (retry logic, worktree handling)
- `packages/core/src/services/lint-service.ts` — LintService interface (not yet in code)

### MCP Patterns
- `packages/mcp-server/src/tools/schemas.ts` — existing schema definitions
- `packages/mcp-server/src/tools/wiki-remember-fact.ts` — current stub
- `packages/mcp-server/src/tools/wiki-remember-session.ts` — current stub
- `packages/mcp-server/src/tools/wiki-ingest.ts` — current stub
- `packages/mcp-server/src/tools/wiki-lint.ts` — current stub

### Phase Context
- `.planning/phases/02-mcp-read-tools/02-CONTEXT.md` — Response envelope pattern continues
- `.planning/ROADMAP.md` §Phase 3 — success criteria
- `.planning/REQUIREMENTS.md` — MCP-04, MCP-05, MCP-06, MCP-07

### Existing Patterns
- SanitizationService modes: redact/warn/block (from core)
- IngestService worktree isolation (from M2)
- LintService phases: consolidate/promote/health (from M3)

</canonical_refs>

 章
## Existing Code Insights

### Reusable Assets
- RememberService already implemented in core
- IngestService already implemented in core with worktree isolation
- Stub handlers exist in packages/mcp-server/src/tools/
- SanitizationService with REDACT mode

### Established Patterns
- MCP tool handlers via factory (`createWikiXxxHandler`)
- Response envelope pattern from Phase 2: `{ success: true, data: T }` / `{ success: false, error: string }`
- AppServices dependency injection from common package

### Integration Points
- Wire handlers to real service calls via AppServices
- Use existing tool registration in server.ts
- Align response shapes with Phase 2 pattern

</code_context>

<specifics>
## Specific Ideas

- User prefers APPEND mode for session deduplication (allows multiple entries per session)
- User prefers configurable retries (N attempts, default 1) before rollback
- Lint runs all 3 phases by default

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-mcp-write-tools*
*Context gathered: 2026-04-13*