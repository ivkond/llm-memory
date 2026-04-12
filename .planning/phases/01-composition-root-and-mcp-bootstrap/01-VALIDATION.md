---
phase: 1
slug: composition-root-and-mcp-bootstrap
status: draft
nyquist_compliant: false
wave_0_complete: false
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

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | WIRE-01 | — | N/A | infra | `rtk pnpm build` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | WIRE-01 | — | Container builds all services | unit | `rtk pnpm --filter @llm-wiki/common test` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | WIRE-02 | — | mcp.host/port loaded with env precedence | unit | `rtk pnpm --filter @llm-wiki/infra test -- config-loader` | ✅ | ⬜ pending |
| 01-02-01 | 02 | 0 | MCP-01 | — | N/A | infra | `rtk pnpm build` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | MCP-01 | T-01-01 | tools/list returns 7 names | integration | `rtk pnpm --filter @llm-wiki/mcp-server test -- tools-list` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 2 | MCP-01 | T-01-02 | stub handler returns McpError not_implemented | integration | `rtk pnpm --filter @llm-wiki/mcp-server test -- handlers-stub` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 2 | MCP-01 | T-01-03 | graceful shutdown on SIGINT | integration | `rtk pnpm --filter @llm-wiki/mcp-server test -- shutdown` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/common/package.json`, `packages/common/tsconfig.json`, `packages/common/src/index.ts`, `packages/common/vitest.config.ts`
- [ ] `packages/mcp-server/package.json`, `packages/mcp-server/tsconfig.json`, `packages/mcp-server/src/index.ts`, `packages/mcp-server/vitest.config.ts`, `packages/mcp-server/src/bin.ts`
- [ ] Root `tsconfig.json` project references updated to include `packages/common`, `packages/mcp-server`
- [ ] `vitest.workspace.ts` extended with new packages
- [ ] `packages/common/tests/build-container.test.ts` — test stubs for `buildContainer` shape
- [ ] `packages/mcp-server/tests/tools-list.test.ts` — test stub for tools/list
- [ ] `packages/mcp-server/tests/handlers-stub.test.ts` — test stub for stub-handlers
- [ ] `packages/mcp-server/tests/shutdown.test.ts` — test stub for graceful shutdown
- [ ] Install `@modelcontextprotocol/sdk@^1.29.0` and (optionally) `zod` top-level in `@llm-wiki/mcp-server`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP client (Claude Code) can call `tools/list` on the running server | MCP-01 | End-to-end with external client; not in CI scope for Phase 1 | 1. `pnpm --filter @llm-wiki/mcp-server dev`. 2. Configure Claude Code MCP with `http://127.0.0.1:<port>/mcp`. 3. Verify 7 tools visible. 4. Invoke any tool → expect not_implemented error. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`--run` or equivalent used)
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills task verifies

**Approval:** pending
