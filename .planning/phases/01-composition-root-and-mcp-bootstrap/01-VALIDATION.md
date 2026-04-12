---
phase: 1
slug: composition-root-and-mcp-bootstrap
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.x (workspace mode) |
| **Config file** | `vitest.workspace.ts`, per-package `vitest.config.ts` |
| **Quick run command** | `rtk pnpm --filter @llm-wiki/common --filter @llm-wiki/mcp-server test -- --run` |
| **Full suite command** | `rtk pnpm test` (root — runs workspace) |
| **Estimated runtime** | ~30 seconds quick, ~90 seconds full |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green + `rtk pnpm build` (tsc -b) passes
- **Max feedback latency:** 90 seconds

---

## Scaffolding Note

There is no separate "Wave 0" plan. The RED-scaffold step (package manifests, tsconfig, vitest.config, failing test files) is **embedded inside each plan's Task 1** as the RED half of a TDD cycle. Plan 01-01 Task 2 scaffolds `@llm-wiki/common`; Plan 01-02 Task 1 scaffolds `@llm-wiki/mcp-server`. Wave numbers below reflect each plan's declared `wave` frontmatter field (01-01 = Wave 1, 01-02 = Wave 2).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 01-01-01 | 01 | 1 | WIRE-02 | — | `mcp.host`/`mcp.port` loaded with shared→local→env precedence, port coerced to number, invalid port rejected | unit (TDD) | `rtk pnpm --filter @llm-wiki/infra test -- config-loader --run` | ⬜ pending |
| 01-01-02 | 01 | 1 | WIRE-01 | — | `@llm-wiki/common` scaffold + failing `buildContainer` test fixture (RED) | infra / build | `rtk pnpm build` | ⬜ pending |
| 01-01-03 | 01 | 1 | WIRE-01 | — | `buildContainer(config)` returns `AppServices` with 7 non-null service instances (GREEN) | unit | `rtk pnpm --filter @llm-wiki/common test --run` | ⬜ pending |
| 01-02-01 | 02 | 2 | MCP-01 | — | `@llm-wiki/mcp-server` scaffold + failing `tools/list`, `handlers-stub`, `shutdown` test fixtures (RED) | infra / build | `rtk pnpm build` | ⬜ pending |
| 01-02-02 | 02 | 2 | MCP-01 | T-01-04, T-01-05, T-01-06, T-01-07, T-01-08, T-01-09 | loopback-default bind, 7 tool names exposed, stub handlers return `isError:true` + `not_implemented`, Zod input validation, graceful SIGINT shutdown, idempotent close, concurrent-request isolation | integration (GREEN) | `rtk pnpm --filter @llm-wiki/mcp-server test --run` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP client (Claude Code) can call `tools/list` on the running server | MCP-01 | End-to-end with external client; not in CI scope for Phase 1 | 1. `pnpm --filter @llm-wiki/mcp-server dev`. 2. Configure Claude Code MCP with `http://127.0.0.1:<port>/mcp`. 3. Verify 7 tools visible. 4. Invoke any tool → expect `not_implemented` error. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (no MISSING references)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Scaffolding embedded in each plan's Task 1 (no orphan MISSING refs)
- [x] No watch-mode flags (`--run` is used explicitly)
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-12
