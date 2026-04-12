---
phase: 01-composition-root-and-mcp-bootstrap
plan: 02
subsystem: transport
tags: [mcp, transport, http, tools, bootstrap, zod]
requires:
  - '@llm-wiki/common buildContainer and AppServices (plan 01-01)'
  - 'WikiConfig.mcp { host, port } defaults (plan 01-01)'
provides:
  - '@llm-wiki/mcp-server workspace package with bin llm-wiki-mcp'
  - 'startServer(services, { host, port }) programmatic API + ServerHandle'
  - '7 registered MCP tools with final Zod input schemas and stub handlers'
  - 'Graceful SIGINT/SIGTERM shutdown with 10s timeout'
affects:
  - tsconfig.json
  - vitest.workspace.ts
  - eslint.config.js
tech-stack:
  added:
    - '@modelcontextprotocol/sdk ^1.29.0 (StreamableHTTPServerTransport, McpServer, McpError)'
    - 'zod ^3.25.0 (input schema validation)'
  patterns:
    - 'Per-request McpServer + Transport (stateless) — avoids cross-request state leakage'
    - 'Pure node:http listener — no express/fastify (D-03 locked)'
    - 'Stderr-only structured-free logger — never logs request bodies (T-01-12)'
    - 'Thin-transport invariant: only main.ts imports @llm-wiki/infra; server.ts and tools/ import only @llm-wiki/common + SDK'
key-files:
  created:
    - packages/mcp-server/package.json
    - packages/mcp-server/tsconfig.json
    - packages/mcp-server/vitest.config.ts
    - packages/mcp-server/tests/tsconfig.json
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/main.ts
    - packages/mcp-server/src/logger.ts
    - packages/mcp-server/src/tools/index.ts
    - packages/mcp-server/src/tools/schemas.ts
    - packages/mcp-server/src/tools/wiki-query.ts
    - packages/mcp-server/src/tools/wiki-recall.ts
    - packages/mcp-server/src/tools/wiki-remember-fact.ts
    - packages/mcp-server/src/tools/wiki-remember-session.ts
    - packages/mcp-server/src/tools/wiki-ingest.ts
    - packages/mcp-server/src/tools/wiki-lint.ts
    - packages/mcp-server/src/tools/wiki-status.ts
    - packages/mcp-server/tests/_helpers.ts
    - packages/mcp-server/tests/tools-list.test.ts
    - packages/mcp-server/tests/handlers-stub.test.ts
    - packages/mcp-server/tests/shutdown.test.ts
    - .planning/phases/01-composition-root-and-mcp-bootstrap/01-02-SUMMARY.md
  modified:
    - tsconfig.json
    - vitest.workspace.ts
    - eslint.config.js
    - pnpm-lock.yaml
decisions:
  - 'Zod shape objects passed to registerTool (not z.object(...)) — the SDK expects a ZodRawShape per @modelcontextprotocol/sdk@^1.29.0 registerTool signature'
  - 'Per-request new McpServer + new StreamableHTTPServerTransport; sessionIdGenerator: undefined, enableJsonResponse: true — stateless JSON mode matches solo-use scope'
  - 'HTTP 413 for bodies > 4 MiB; HTTP 405 for GET /mcp; HTTP 404 for other paths'
  - 'httpServer.closeAllConnections() called inside handle.close() so idle keep-alive sockets from prior test requests do not block close() resolution on Node 20+'
  - 'Internal 500 response body is the fixed string {error:"Internal error"} — raw error goes to stderr only (T-01-07)'
metrics:
  duration: ~40min
  completed: 2026-04-12
---

# Phase 01 Plan 02: MCP Server Bootstrap — Summary

One-liner: Built `@llm-wiki/mcp-server`, a thin Streamable-HTTP MCP transport on `node:http` that registers 7 tools with Zod input schemas and stub `not_implemented` handlers, binds loopback-only, handles graceful shutdown, and is covered by 16 integration tests.

## Files Created and Modified

### Created

Package manifest & tooling:

- `packages/mcp-server/package.json` — ESM private package; `bin: { "llm-wiki-mcp": "./dist/main.js" }`; deps on `@llm-wiki/common`, `@llm-wiki/infra`, `@modelcontextprotocol/sdk@^1.29.0`, `zod@^3.25.0`.
- `packages/mcp-server/tsconfig.json` — composite; references `../common` and `../infra`.
- `packages/mcp-server/tests/tsconfig.json` — test-only tsconfig mirroring the infra/common pattern (ESLint `projectService` requires it).
- `packages/mcp-server/vitest.config.ts` — workspace source aliases for `@llm-wiki/core | infra | common`; 15s test timeout.

Production source:

- `src/index.ts` — barrel (`startServer`, `ServerHandle`, `registerAllTools`, `TOOL_NAMES`, `ToolName`).
- `src/server.ts` — `startServer(services, { host, port })` + `handle.close()`; per-request `McpServer` + `StreamableHTTPServerTransport`; 4 MiB body cap; 405/404 dispatch; force-closes idle keep-alive sockets on shutdown.
- `src/main.ts` — CLI entry: expand `~` in `LLM_WIKI_PATH`, `ConfigLoader.load()`, `buildContainer`, `startServer`, install SIGINT/SIGTERM with 10s force-exit timeout. Only file in the package that imports `@llm-wiki/infra`.
- `src/logger.ts` — `logInfo` / `logError` via `process.stderr.write` (no `console.*`; never logs bodies).
- `src/tools/schemas.ts` — Zod shape objects for each of the 7 tools, derived from the domain request types. Exports `wikiQueryShape`, `wikiRecallShape`, `wikiRememberFactShape`, `wikiRememberSessionShape`, `wikiIngestShape`, `wikiLintShape`, `wikiStatusShape`.
- `src/tools/index.ts` — `TOOL_NAMES` (frozen tuple of 7), `registerAllTools(server, services)`.
- `src/tools/wiki-{query,recall,remember-fact,remember-session,ingest,lint,status}.ts` — 7 stub handler factories, each returning an async function that throws `McpError(ErrorCode.InternalError, '<tool>: not_implemented (Phase 2/3)')`.

Tests:

- `tests/_helpers.ts` — `makeFakeAppServices()` (empty frozen record cast to `AppServices`; handlers never touch it), `postMcp`, `readJsonRpc`, `MINIMAL_TOOL_ARGS` map.
- `tests/tools-list.test.ts` — 5 tests: 7 tool names, `inputSchema.type === 'object'`, GET /mcp → 405, GET / → 404/405, loopback bind.
- `tests/handlers-stub.test.ts` — 8 tests: `it.each` over 7 tool names asserting `isError:true` + `not_implemented` text, plus one invalid-args test confirming Zod validation fires before the stub.
- `tests/shutdown.test.ts` — 3 tests: port-release after close, idempotent close, 5-way concurrent `tools/list` isolation (per-request transport).

### Modified

- `tsconfig.json` — added `{ "path": "packages/mcp-server" }` reference.
- `vitest.workspace.ts` — added `'packages/mcp-server'` to the workspace array.
- `eslint.config.js` — registered `packages/mcp-server/tsconfig.json` and `packages/mcp-server/tests/tsconfig.json` in the import-x TypeScript resolver.
- `pnpm-lock.yaml` — picks up `@modelcontextprotocol/sdk@1.29.0`, `zod@3.25.x`, and their transitive dependencies.

## Defaults & Contract

| Key | Value | Source |
|-----|-------|--------|
| Default MCP host | `127.0.0.1` | `WikiConfig.DEFAULTS.mcp.host` (plan 01-01) |
| Default MCP port | `7849` | `WikiConfig.DEFAULTS.mcp.port` (plan 01-01) |
| Max request body | `4 MiB` | `MAX_BODY_BYTES` in `server.ts` |
| Shutdown grace window | `10 000 ms` | `SHUTDOWN_TIMEOUT_MS` in `main.ts` |
| Endpoint | `POST /mcp` | `server.ts` |
| GET /mcp | `405` with `Allow: POST` | `server.ts` |
| Other paths | `404` | `server.ts` |

SDK subpath imports used (pinned in `server.ts` and tool stubs):

- `@modelcontextprotocol/sdk/server/mcp.js` → `McpServer`
- `@modelcontextprotocol/sdk/server/streamableHttp.js` → `StreamableHTTPServerTransport`
- `@modelcontextprotocol/sdk/types.js` → `McpError`, `ErrorCode`

Tool names (order stable, exported as `TOOL_NAMES`):

```
wiki_query, wiki_recall, wiki_remember_fact, wiki_remember_session,
wiki_ingest, wiki_lint, wiki_status
```

## Thin-Transport Invariant — Enforcement Evidence

Grep checks (all run post-commit, zero unexpected matches):

| Check | Pattern | Scope | Result |
|-------|---------|-------|--------|
| No `@llm-wiki/core` imports in src | `@llm-wiki/core` | `packages/mcp-server/src` | 0 matches |
| `@llm-wiki/infra` only in main.ts | `@llm-wiki/infra` | `packages/mcp-server/src` | 2 matches — both in `main.ts` (import + comment) |
| No `0.0.0.0` anywhere | `0\.0\.0\.0` | `packages/mcp-server/src` | 0 matches |
| No `console.*` calls | `console\.` | `packages/mcp-server/src` | 2 matches — both inside `logger.ts` comments explaining the ban |
| No `TODO` / `FIXME` | `TODO\|FIXME` | `packages/mcp-server/src` | 0 matches |

## Security Mitigations (STRIDE)

| Threat | Mitigation | Implementation |
|--------|------------|----------------|
| T-01-04 Elevation via bind | loopback default | `main.ts` passes `config.mcp.host` which defaults to `127.0.0.1` in `WikiConfig.DEFAULTS`; no hard-coded `0.0.0.0` anywhere. |
| T-01-05 DoS via oversize body | 4 MiB cap | `readJsonBody` tracks cumulative bytes and throws `PayloadTooLargeError` → HTTP 413 before `JSON.parse`. |
| T-01-06 Tampering via shared transport | per-request instance | Each POST /mcp constructs `new McpServer` + `new StreamableHTTPServerTransport` with `sessionIdGenerator: undefined`. Asserted by `test_concurrentRequests_inStatelessMode_eachGetsOwnResponse`. |
| T-01-07 Info disclosure via raw errors | generic 500 body | `handleRequestError` writes fixed string `'Internal error'`; raw error goes to `logError(stderr)` only. |
| T-01-08 Malformed tool args | Zod validation | `registerTool` gets Zod shape; SDK validates before invoking handler. Asserted by `test_toolCall_invalidArgs_returnsValidationError`. |
| T-01-09 Shutdown hang | 10s force-exit | `installShutdown` sets `setTimeout(() => process.exit(1), 10_000).unref()` alongside `handle.close()`. |
| T-01-12 Log disclosure | stderr-only, no bodies | `logger.ts` never accepts request body arguments; `server.ts` only calls `logError(message, err)`. |

## Test Counts

| File | Tests | Status |
|------|-------|--------|
| `tests/tools-list.test.ts` | 5 | green |
| `tests/handlers-stub.test.ts` | 8 (7 parameterized + 1 invalid-args) | green |
| `tests/shutdown.test.ts` | 3 | green |
| **package total** | **16** | **16/16 green** |

Workspace totals after this plan:

| Package | Tests (before) | Tests (after) |
|---------|----------------|---------------|
| `@llm-wiki/core` | — | — (unchanged) |
| `@llm-wiki/infra` | 141 | 141 (unchanged) |
| `@llm-wiki/common` | 5 | 5 (unchanged) |
| `@llm-wiki/mcp-server` | 0 | **16 (new)** |
| **Workspace total** | **146** | **162** |

## Verification Log

| Gate | Command | Result |
|------|---------|--------|
| Dependency install | `pnpm install` | picked up SDK + zod (+ `raw-body`, `pkce-challenge` transitive) |
| Full type-check | `pnpm build` (`tsc -b`) | green across core + infra + common + mcp-server |
| Package tests | `pnpm --filter @llm-wiki/mcp-server test` | 16/16 green, ~0.8s |
| Full workspace tests | `pnpm -w test` | 162/162 green |
| Pre-commit hook | `.githooks/pre-commit` (eslint + prettier + typecheck + vitest) | **passed** on commit `a9c2fcb` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Plan called for a separate RED commit (Task 1)**

- **Found during:** pre-commit hook policy review.
- **Issue:** The project's `.githooks/pre-commit` runs the full workspace test suite on every commit. A Task-1-only RED commit (16 failing tests by design) would be rejected, and GSD executor instructions also mandate committing with hooks (no `--no-verify`).
- **Fix:** Combined Task 1 (scaffold + failing tests) and Task 2 (implementation) into a single commit `a9c2fcb`. TDD discipline preserved: tests were written from the behavior specification before implementation was coded; they did NOT receive post-hoc edits to match the implementation.
- **Commit:** `a9c2fcb` (combined).

**2. [Rule 3 — Blocking issue] ESLint `@typescript-eslint/no-unnecessary-type-assertion` on two test idioms**

- **Found during:** Pre-commit hook run (attempt 1 → blocked).
- **Issue:** `const ids = [1, 2, 3, 4, 5] as const;` and `const body = responses[i]!;` were flagged as unnecessary assertions under the current strict config (no `noUncheckedIndexedAccess`).
- **Fix:** Dropped `as const` (numeric literal array is fine for `.forEach(id => ...)`); dropped non-null bang on `responses[i]` (index access already returns the element type).
- **Files modified:** `packages/mcp-server/tests/shutdown.test.ts`.

**3. [Rule 3 — Blocking issue] Prettier formatting in 4 files**

- **Found during:** Pre-commit hook run (attempt 1 → blocked).
- **Issue:** Long `McpError` message literals in `wiki-remember-fact.ts` / `wiki-remember-session.ts` were on a single line; two test files had minor wrapping differences.
- **Fix:** `pnpm exec prettier --write` on the four flagged files; re-staged.
- **Files modified:** `packages/mcp-server/src/tools/wiki-remember-fact.ts`, `packages/mcp-server/src/tools/wiki-remember-session.ts`, `packages/mcp-server/tests/shutdown.test.ts`, `packages/mcp-server/tests/tools-list.test.ts`.

### Non-deviation notes

- ESLint `@typescript-eslint/require-await` warnings on each of the 7 stub handlers are **intentional** — the factories return `async () => { throw ... }` because the MCP SDK's `registerTool` signature requires a handler returning `Promise<CallToolResult>`. These are `warn` level in the project ESLint config and will be resolved naturally in Phase 2/3 when the bodies become truly async.
- Invalid-args test (`test_toolCall_invalidArgs_returnsValidationError`) accepts either a JSON-RPC top-level `error` with code `-32602` **or** a tool-result with `isError: true` whose text does not contain `not_implemented`. Both indicate the stub handler was never reached; the SDK's exact shape for Zod-validation failure is not pinned in the plan and can vary across minor versions.
- `httpServer.closeAllConnections?.()` is called inside `handle.close()`. This is needed because Node 20+ keeps idle keep-alive connections open after `close()`, which would let the shutdown test hang for the Node default 5s keep-alive timeout. Optional-chaining protects Node versions < 18.2.

## Auth Gates

None encountered.

## Manual Smoke Test

Per `01-VALIDATION.md`:

```bash
# Set wiki root, then run:
pnpm --filter @llm-wiki/mcp-server build
LLM_WIKI_PATH=~/.llm-wiki node packages/mcp-server/dist/main.js &
curl -s -X POST http://127.0.0.1:7849/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
# → JSON-RPC response containing 7 tools
kill -INT $!  # process exits 0 within 10s
```

Not run in CI for Phase 1 — it requires real API keys and a real `~/.llm-wiki` repo.

## Self-Check: PASSED

- `packages/mcp-server/package.json` exists
- `packages/mcp-server/tsconfig.json` exists
- `packages/mcp-server/vitest.config.ts` exists
- `packages/mcp-server/tests/tsconfig.json` exists
- `packages/mcp-server/src/index.ts` exists
- `packages/mcp-server/src/server.ts` exists
- `packages/mcp-server/src/main.ts` exists
- `packages/mcp-server/src/logger.ts` exists
- `packages/mcp-server/src/tools/index.ts` exists
- `packages/mcp-server/src/tools/schemas.ts` exists
- `packages/mcp-server/src/tools/wiki-query.ts` exists
- `packages/mcp-server/src/tools/wiki-recall.ts` exists
- `packages/mcp-server/src/tools/wiki-remember-fact.ts` exists
- `packages/mcp-server/src/tools/wiki-remember-session.ts` exists
- `packages/mcp-server/src/tools/wiki-ingest.ts` exists
- `packages/mcp-server/src/tools/wiki-lint.ts` exists
- `packages/mcp-server/src/tools/wiki-status.ts` exists
- `packages/mcp-server/tests/_helpers.ts` exists
- `packages/mcp-server/tests/tools-list.test.ts` exists
- `packages/mcp-server/tests/handlers-stub.test.ts` exists
- `packages/mcp-server/tests/shutdown.test.ts` exists
- Commit `a9c2fcb` found in `git log`
