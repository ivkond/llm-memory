# Phase 3: MCP Write Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 03-mcp-write-tools
**Areas discussed:** remember_fact sanitization, remember_session deduplication, ingest error handling, lint phase selection

---

## remember_fact sanitization

| Option | Description | Selected |
|--------|-------------|----------|
| Redact | Strip secret values, replace with [REDACTED] — safe for storage | ✓ |
| Warn | Store with original but warn the agent — more data | |
| Block | Reject any input containing potential secrets — strictest | |

**User's choice:** Redact (Recommended)
**Notes:** Default mode — aligns with SANIT-01 requirement

---

## remember_session deduplication

| Option | Description | Selected |
|--------|-------------|----------|
| Upsert | Update existing entry if session_id exists — natural for resume | |
| Reject | Throw error if session_id already exists — fail fast | |
| Append | Allow duplicates, add new entry each time — simple | ✓ |

**User's choice:** Append
**Notes:** User wants to allow multiple entries per session (e.g., for tracking progress over time)

---

## ingest error handling

| Option | Description | Selected |
|--------|-------------|----------|
| Rollback | Clean up worktree on failure, report error — safe default | |
| Leave worktree | Leave failed worktree for manual recovery — debuggable | |
| Retry | Auto-retry once on transient failure — resilient | ✓ |

**User's choice:** N retries (configurable), then on rollback with error report
**Notes:** Configurable retries via ConfigLoader (wiki.ingest.retries, default 1)

---

## lint phase selection

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 phases | consolidate, promote, health — full lint cycle | ✓ |
| consolidate + promote | Skip health — faster for regular runs | |
| consolidate only | Just verbatim consolidation — minimal run | |

**User's choice:** All 3 phases
**Notes:** Full lint cycle (INV-9)

---

## Agent's Discretion

- Retry N configurable via ConfigLoader
- Worktree naming convention

## Deferred Ideas

None