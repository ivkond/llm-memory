---
phase: 02-mcp-read-tools
plan: 01
subsystem: mcp-server
tags: [mcp, read-tools, query, recall, status]
dependency_graph:
  requires: []
  provides:
    - wiki_query → QueryService
    - wiki_recall → RecallService
    - wiki_status → WikiStatusService
  affects: [mcp-client]
tech_stack:
  added: []
  patterns:
    - D-04: { success: true, data: T } envelope
    - D-06: wiki_recall returns { project, pages, unconsolidated_count, total_pages }
    - D-07: wiki_status returns { total_pages, projects, unconsolidated, index_health, last_lint, last_ingest }
    - D-09: graceful degradation (LLM failure returns raw citations)
key_files:
  created: []
  modified:
    - packages/mcp-server/src/tools/wiki-query.ts
    - packages/mcp-server/src/tools/wiki-recall.ts
    - packages/mcp-server/src/tools/wiki-status.ts
decisions:
  - 'Implemented D-04 envelope: all tools return { success: true, data } or { success: false, error, code }'
  - 'Response format: JSON in TextContent.text, not MCP errors'
metrics:
  duration: ~10min
  completed: 2026-04-13T19:58:00Z
---

# Phase 02 Plan 01: Wire MCP Read Tools Summary

**One-liner:** 3 read-only MCP tools wired to QueryService, RecallService, WikiStatusService

## What Was Built

- **wiki_query** → QueryService with hybrid search + LLM synthesis
- **wiki_recall** → RecallService with recency-sorted context
- **wiki_status** → WikiStatusService with health metrics

All tools now return per D-04 envelope:
- Success: `{ success: true, data: T }`
- Failure: `{ success: false, error: string, code: string }`

## Key Changes

| File | Change |
|------|--------|
| wiki-query.ts | Wired to QueryService, maps params, returns envelope |
| wiki-recall.ts | Wired to RecallService, returns project + pages |
| wiki-status.ts | Wired to WikiStatusService, returns health metrics |

## Test Updates

Updated `handlers-stub.test.ts` to verify envelope pattern:
- 3 tests for wired tools (verify `success` boolean in JSON response)
- 4 tests for stub tools (still return not_implemented error)

## Self-Check

- [x] Build passes (`pnpm build`)
- [x] Tests pass (16/16)
- [x] Commits created

## Threat Flags

None — read-only tools with no new network/data surface.