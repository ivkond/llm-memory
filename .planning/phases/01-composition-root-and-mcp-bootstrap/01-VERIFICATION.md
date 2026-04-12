---
phase: 01-composition-root-and-mcp-bootstrap
verified: 2026-04-12T23:05:00Z
status: passed
score: 3/3 success criteria verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 1: Composition Root and MCP Bootstrap — Verification Report

**Phase Goal:** Services are wired with real adapters and MCP server starts and responds to requests.
**Verified:** 2026-04-12
**Verdict:** **PASS**
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths (Success Criteria)

| #   | Truth                                                                                                            | Status     | Evidence                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 | Single composition root instantiates all adapters (config, search, git, LLM, sanitizer) and injects into services via constructor | ✓ VERIFIED | `packages/common/src/build-container.ts:56-138` — `buildContainer(config)` news all infra adapters and constructs 7 domain services via pure constructor injection; returns frozen `AppServices`. Tests `packages/common/tests/build-container.test.ts` (5/5 pass) assert all 7 services are the correct `instanceof`, object is frozen, missing api_key does not throw. |
| SC-2 | Configuration loaded via ConfigLoader with precedence shared YAML → local YAML → env                             | ✓ VERIFIED | `packages/infra/src/config-loader.ts:22-109` — `mcp.{host,port}` in `WikiConfig` + `DEFAULTS`, env map includes `LLM_WIKI_MCP_HOST`/`LLM_WIKI_MCP_PORT` with `coercePort` validation (1-65535, integer). `packages/infra/tests/config-loader.test.ts` (10/10) includes env-overrides-YAML, invalid port rejection, out-of-range rejection. |
| SC-3 | MCP server starts on configured HTTP port and `tools/list` returns expected 7 tool names                         | ✓ VERIFIED | `packages/mcp-server/src/server.ts:39-80` uses `node:http` + `StreamableHTTPServerTransport`. `tools/index.ts:24-32` registers exactly `wiki_query, wiki_recall, wiki_remember_fact, wiki_remember_session, wiki_ingest, wiki_lint, wiki_status`. `tests/tools-list.test.ts` asserts all 7 names returned, each has object inputSchema, GET→405, loopback bind. |

**Score:** 3/3 success criteria verified.

### Required Artifacts

| Artifact                                         | Expected                                                   | Status     | Details                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `packages/common/src/build-container.ts`         | Composition root wiring all adapters + services            | ✓ VERIFIED | 143 lines, constructor injection, `Object.freeze`, per-call `FileStoreFactory` closure     |
| `packages/common/src/app-services.ts`            | `AppServices` contract                                     | ✓ VERIFIED | 7 readonly fields matching services                                                        |
| `packages/infra/src/config-loader.ts`            | Adds `mcp.{host,port}` + env overrides                     | ✓ VERIFIED | Defaults `127.0.0.1:7849`, env+YAML coercion, integer 1-65535 validation                    |
| `packages/mcp-server/src/main.ts`                | Sole file allowed to import `@llm-wiki/infra` (D-02)       | ✓ VERIFIED | Only `ConfigLoader` imported from infra; graceful SIGINT/SIGTERM shutdown with 10 s timeout |
| `packages/mcp-server/src/server.ts`              | Pure `node:http` + `StreamableHTTPServerTransport`         | ✓ VERIFIED | Per-request McpServer+Transport (stateless), 4 MB body cap, 405/404/500/413 hygiene        |
| `packages/mcp-server/src/tools/{index,schemas}.ts` + 7 handlers | 7 tools registered with Zod shapes + stub handlers        | ✓ VERIFIED | `TOOL_NAMES` tuple matches spec; each stub throws `McpError(InternalError, '... not_implemented (Phase 2/3)')` |

### Key Link Verification

| From                       | To                         | Via                                                  | Status | Details                                                        |
| -------------------------- | -------------------------- | ---------------------------------------------------- | ------ | -------------------------------------------------------------- |
| `main.ts`                  | `ConfigLoader` (infra)     | `new ConfigLoader(wikiRoot).load()`                  | WIRED  | Only infra import in mcp-server; loads config at startup       |
| `main.ts`                  | `buildContainer` (common)  | `buildContainer(config)` → `AppServices`             | WIRED  | Passes result to `startServer`                                 |
| `main.ts`                  | `startServer`              | `startServer(services, {host, port})`                | WIRED  | Uses `config.mcp.host` / `config.mcp.port`                     |
| `server.ts`                | `registerAllTools`         | per-request after `new McpServer`                    | WIRED  | Tools reconstructed per request (stateless mode)               |
| Handler stubs              | `McpError(InternalError)`  | `throw new McpError(..., '<tool>: not_implemented')` | WIRED  | Surfaced by SDK as `result.isError=true` with text payload     |
| SIGINT/SIGTERM             | `handle.close()`           | `installShutdown(handle)`                            | WIRED  | Idempotent, 10 s timeout, `unref`'d timer, test-verified       |

### Behavioral Spot-Checks

| Behavior                                                   | Command                                         | Result                    | Status |
| ---------------------------------------------------------- | ----------------------------------------------- | ------------------------- | ------ |
| Project builds                                             | `pnpm build` (tsc -b solution)                  | Exit 0, no diagnostics    | ✓ PASS |
| `@llm-wiki/common` tests                                   | `vitest run` (pkg common)                       | 5/5 pass                  | ✓ PASS |
| `@llm-wiki/infra` tests (config-loader + everything else)  | `vitest run` (pkg infra)                        | 141/141 pass              | ✓ PASS |
| `@llm-wiki/mcp-server` tests (tools-list, handlers, shutdown) | `vitest run` (pkg mcp-server)                | 16/16 pass                | ✓ PASS |
| Only `main.ts` imports `@llm-wiki/infra` (D-02)            | `grep @llm-wiki/infra packages/mcp-server/src`  | Match in `main.ts` only   | ✓ PASS |
| No bind on `0.0.0.0` (D-04)                                | `grep 0.0.0.0 packages/mcp-server`              | Zero matches              | ✓ PASS |
| No express/fastify dep (D-03)                              | `grep express|fastify packages/mcp-server`      | Zero matches              | ✓ PASS |
| No TODO/FIXME in new code                                  | `grep TODO|FIXME packages/{common,mcp-server}/src` | Zero matches           | ✓ PASS |
| No `console.*` in production code                          | `grep console.(log|warn|error) packages/mcp-server/src` | Zero matches (logger uses `process.stderr.write`) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                 | Status      | Evidence                                                                                     |
| ----------- | ----------- | --------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| WIRE-01     | 01-01       | Single composition root instantiates all adapters and injects into services | ✓ SATISFIED | `build-container.ts` + `build-container.test.ts` (all 7 services via ctor)                   |
| WIRE-02     | 01-01       | ConfigLoader with shared + local + env precedence                           | ✓ SATISFIED | `config-loader.ts:62-83` merge order defaults→shared→local→env + `config-loader.test.ts`    |
| MCP-01      | 01-02       | MCP server starts via HTTP (Streamable HTTP) and responds to tool list      | ✓ SATISFIED | `server.ts` + `tools-list.test.ts` asserts all 7 names via live HTTP roundtrip              |

No orphaned requirements — REQUIREMENTS.md maps WIRE-01, WIRE-02, MCP-01 to Phase 1; all three are claimed by the two plans in this phase.

### Locked Decision Adherence (D-01..D-06)

| # | Decision                                                                        | Status    | Evidence                                                                                          |
| - | ------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| D-01 | Composition root lives in dedicated `@llm-wiki/common`                        | ✓ ADHERES | Package exists at `packages/common/` with `package.json` name `@llm-wiki/common`                  |
| D-02 | mcp-server thin wrapper; only `main.ts` may import `@llm-wiki/infra`          | ✓ ADHERES | Grep confirms single import site in `main.ts:3`                                                   |
| D-03 | Pure `node:http` + `StreamableHTTPServerTransport`; no web framework          | ✓ ADHERES | `server.ts:1,4` uses `node:http.createServer` + SDK transport; no express/fastify dep             |
| D-04 | Default bind `127.0.0.1`                                                      | ✓ ADHERES | `DEFAULTS.mcp.host = '127.0.0.1'` in `config-loader.ts:33`; test asserts handle URL begins with `http://127.0.0.1:` |
| D-05 | All 7 tools registered with final schemas in Phase 1                          | ✓ ADHERES | `TOOL_NAMES` tuple has exactly the 7 canonical names; `registerAllTools` registers all with Zod shapes |
| D-06 | Schemas mirror domain request types                                            | ✓ ADHERES | `schemas.ts` fields align with `QueryRequest`/`RecallRequest`/`RememberFactRequest`/etc. Stubs take `AppServices` so Phase 2/3 only swaps handler bodies |

### Threat Model Spot-Checks

| Invariant                                                | Status    | Evidence                                                                                           |
| -------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| Per-request `McpServer` + `StreamableHTTPServerTransport` (T-01-stateless) | ✓ | `server.ts:90-102` instantiates both inside `handleRequest`; `res.on('close')` disposes them      |
| Request body size bounded (T-01-05, DoS)                 | ✓         | `MAX_BODY_BYTES = 4 MB` enforced in `readJsonBody`; oversize → HTTP 413 before JSON.parse          |
| Idempotent shutdown on SIGINT/SIGTERM                    | ✓         | `main.ts:45-76` — `shuttingDown` guard; `handle.close` itself is idempotent (`closed` flag, test `test_handleClose_calledTwice_isIdempotent`) |
| Generic error hygiene (T-01-07)                          | ✓         | `handleRequestError` returns only `'Internal error'` / `'Payload Too Large'`; stack traces logged to stderr, not network |
| Loopback default (T-01-04)                               | ✓         | Default `127.0.0.1`; no `0.0.0.0` in source                                                        |
| No leak of tool arguments to logs (T-01-12)              | ✓         | `logger.ts` only logs signals + error name/message; no payload logging anywhere                    |
| Port validation at config time                           | ✓         | `coercePort` rejects non-integers and out-of-range; test `test_coercePort_outOfRange_throws`       |

### Anti-Patterns Found

None. No `TODO|FIXME|HACK|PLACEHOLDER` in `packages/common/src` or `packages/mcp-server/src`. No `console.*` in production code. No stub returns of `null`/`[]` masquerading as implementations — the stub handlers explicitly throw `McpError(InternalError, 'not_implemented (Phase N)')`, which is the intentional, locked contract for Phase 1 per D-05.

### Human Verification Required

None. All success criteria are verifiable by code + automated tests which were executed and passed. The server has no UI surface and the MCP protocol contract is fully covered by integration tests over real `node:http` sockets.

### Gaps Summary

No gaps. Phase 1 delivers its stated goal:
- Composition root wires every domain service with real infra adapters via constructor injection.
- ConfigLoader honours defaults → shared YAML → local YAML → env precedence for all fields including `mcp.{host,port}` with strict port validation.
- MCP Streamable-HTTP server starts on the configured loopback port, exposes exactly 7 tools with final schemas, returns proper JSON-RPC errors, and shuts down cleanly on SIGINT/SIGTERM.
- All 6 locked decisions (D-01..D-06) are observed in the codebase.
- Full build + test suite green: `tsc -b` clean, infra 141/141, common 5/5, mcp-server 16/16.

Requirements status line in REQUIREMENTS.md currently shows WIRE-01 / WIRE-02 as "Pending" — recommend flipping to "Complete" now that Phase 1 is verified (minor doc sync, not a code gap).

---

_Verified: 2026-04-12T23:05:00Z_
_Verifier: Claude (gsd-verifier)_
