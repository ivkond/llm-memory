# Phase 5: Claude Code Integration - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Build Claude Code integration so that sessions automatically load wiki context on start and persist learnings on stop. This includes session hooks (auto recall on SessionStart, auto remember on Stop) and a `/wiki` guide skill explaining available MCP tools and workflow.

</domain>

<decisions>
## Implementation Decisions

### Hook Mechanism
- **D-01:** Connection: **Direct MCP HTTP calls** — Claude Code loads `.claude/hooks.yml` with start/stop commands that call the MCP server via HTTP
  - Why: Simplest integration, no wrapper package needed, works with existing MCP server from Phase 1
  - Alternative rejected: MCP stdio transport (not in scope per PROJECT.md), wrapper package (unnecessary complexity)

### Project Detection
- **D-02:** Project detection cascade: **cwd → project config → fault**
  - Primary: Extract project from current working directory where Claude Code runs
  - Fallback: Look for project identifier in config files in that directory
  - Fault: If no project detected, fail with helpful error message

### Context Injection
- **D-03:** Injection mechanism: **System prompt preamble** (~100-250 tokens with references)
  - Why: Reliable injection method, allows explicit control over token budget
  - Alternative rejected: Claude Code native context (less control)
  - Token budget: 100-250 tokens (user preference)

### Session Summarization
- **D-04:** Summary generation: **LLM summarization** with fallback to simple heuristics
  - Primary: Use LLM to generate summary from conversation history (higher quality)
  - Fallback: If LLM unavailable (connection error, timeout), use simple heuristics (files read, commands run, errors) + user feedback
  - Why: User wants quality but with graceful degradation

### /wiki Skill Implementation
- **D-05:** Skill format: **Hybrid** — both slash command package and fallback documentation
  - Primary: Standalone package that Claude Code loads via /slash command
  - Fallback: Documentation file explaining available MCP tools and workflow
  - Why: Best of both worlds — rich interaction when package available, always works as documentation

### Claude's Discretion
- Exact token budget within 100-250 range — planner decides
- Hook script location: `.claude/hooks.yml` (standard Claude Code location)
- Summary prompt structure — planner designs
- Documentation location — planner chooses

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Integration -- Claude Code — HOOK-01, HOOK-02, SKILL-01
- `.planning/ROADMAP.md` §Phase 5 — success criteria (3 items)

### Prior Phase Context
- `.planning/phases/01-composition-root-and-mcp-bootstrap/01-CONTEXT.md` — MCP server setup (Phase 1)
- `.planning/phases/02-mcp-read-tools/02-CONTEXT.md` — wiki_recall tool (Phase 2)
- `.planning/phases/04-cli/04-CONTEXT.md` — CLI patterns (Phase 4)

### Service Interfaces
- `packages/core/src/services/recall-service.ts` — RecallService interface
- `packages/core/src/services/remember-service.ts` — RememberService interface for wiki_remember_session

### Code Context
- `packages/mcp-server/src/server.ts` — existing MCP server
- `packages/common/src/build-container.ts` — AppServices factory
- `.claude/hooks.yml` — standard Claude Code hooks location (needs creation)

</canonical_refs>

 章
## Existing Code Insights

### Reusable Assets
- **MCP Server** from Phase 1 — already running on HTTP, can receive hook calls
- **wiki_recall** tool — wired in Phase 2, returns project context
- **wiki_remember_session** tool — wired in Phase 3, stores session summaries
- **AppServices** from `@llm-wiki/common` — same container used by CLI

### Established Patterns
- **Response envelope**: `{ success: true, data: T }` / `{ success: false, error: string }` — from Phase 2-3
- **HTTP transport**: Streamable HTTPServerTransport, loopback-only

### Integration Points
- Entry: `.claude/hooks.yml` (new file in wiki root or user home)
- Depends on: MCP server running (Phase 1-3), HTTP endpoint accessible
- Hook scripts call MCP server via curl/httpie

</code_context>

<specifics>
## Specific Ideas

- Direct MCP HTTP calls from Claude Code hooks (no wrapper package)
- Token budget: 100-250 tokens (reduced from initial ~500 suggestion)
- LLM summarization with simple heuristics fallback
- Hybrid /wiki skill: slash command package + documentation fallback

</specifics>

<deferred>
## Deferred Ideas

- Claude Code native context injection method — rejected in favor of system prompt
- MCP stdio transport — out of scope per PROJECT.md

</deferred>

---

*Phase: 05-claude-code-integration*
*Context gathered: 2026-04-13*