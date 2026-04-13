# Phase 4: CLI - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a command-line interface for all wiki operations (init, ingest, lint, import, search, status) so developers can perform wiki operations from the terminal without needing MCP.

</domain>

<decisions>
## Implementation Decisions

### CLI Framework
- **D-01:** Framework: **Cliffy** — native Deno heritage, mature for Node, excellent TypeScript support, built-in chalk/colors
  - Why: Best fit for existing stack (pure TypeScript, ESM, Node 20+), avoids YAGNI additions
  - Alternative: Commander + Chalk rejected (more boilerplate), parseArgs rejected (no subcommands), Yargs rejected (dated ESM)

### Output Format
- **D-02:** Default: **Rich with colors** — colors, tables, progress bars for interactive terminal
  - Why: CLI primary use is interactive terminal; scripts can pipe/parse if needed
  - Future: Could add --json flag for programmatic use if demand emerges

### Config Location
- **D-03:** Storage: **Local + Global with XDG Base Directory**
  - Global: `~/.config/llm-wiki/config.yaml` (or `$XDG_CONFIG_HOME/llm-wiki/config.yaml`)
  - Global data: `~/.cache/llm-wiki/` for index, vectors
  - Local: `<wiki>/.llm-wiki/config.yaml` — per-project overrides
  - Precedence: local > global > env vars > defaults
  - Why: Follows XDG convention, allows per-project config, keeps secrets out of wiki dir

### Interactive Prompts
- **D-04:** Missing params trigger **interactive prompts** — better UX for CLI usage
  - Why: User preference for rich CLI experience
  - Fallback: In non-TTY, fail with helpful error message listing required params

### Subcommand Style
- **D-05:** **Unified entry** `llm-wiki <cmd>` — shares config and services better
  - Commands: init, ingest, lint, import, search, status
  - Why: Single binary, shares connection pool, common flags, better DX
  - Alternative rejected: Separate commands (llm-wiki-init, etc.) — more installation friction

### Claude's Discretion
- Default port: planner chooses (within 7000-9999)
- Binary name: `llm-wiki` (npm bin or direct node invocation)
- Logging: `console.error` sufficient for Phase 4 (pino/winston overkill)
- Help formatting: Cliffy built-in --help sufficient

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CLI Commands (from Requirements)
- `.planning/REQUIREMENTS.md` §CLI — CLI-01 through CLI-06 exact specs
- `.planning/ROADMAP.md` §Phase 4 — success criteria (6 commands)

### Framework & Architecture
- `.planning/PROJECT.md` — constraints, key decisions
- `.planning/phases/01-composition-root-and-mcp-bootstrap/01-CONTEXT.md` — `@llm-wiki/common` wiring pattern
- `.planning/phases/03-mcp-write-tools/03-CONTEXT.md` — Response envelope pattern continues (Phase 2 established)

### Code Context
- `packages/common/src/build-container.ts` — existing AppServices factory (reused by CLI)
- `packages/common/src/app-services.ts` — AppServices type (CLI wires to same services as MCP)
- `packages/core/src/services/` — all 7 services already implemented
- `packages/infra/src/config-loader.ts` — existing config loading pattern

### XDG Specification
- https://specifications.freedesktop.org/basedir-spec/bas edir-spec-0.8.html — XDG Base Directory spec (for config/cache paths)

</canonical_refs>

 章
## Existing Code Insights

### Reusable Assets
- **AppServices** from `@llm-wiki/common` — same container used by MCP server, CLI reuses it
- **All domain services** — RememberService, RecallService, QueryService, IngestService, WikiStatusService, LintService, ImportService already implemented
- **ConfigLoader** — already loads shared + local + env, CLI just needs different entry points

### Established Patterns
- **Response envelope**: `{ success: true, data: T }` / `{ success: false, error: string }` — from Phase 2-3
- **Named exports**: from `@llm-wiki/common` barrel
- **ESM, NodeNext resolution**: mandatory

### Integration Points
- Entry: `packages/cli/src/index.ts` — new package (mirrors `packages/mcp-server`)
- Depends on: `@llm-wiki/common` (not directly on core/infra)
- Bin registration: `package.json` bin field

</code_context>

<specifics>
## Specific Ideas

- Config in XDG directories: `~/.config/llm-wiki/` and `~/.cache/llm-wiki/`
- CLI uses same AppServices as MCP server (via `@llm-wiki/common`)
- All 6 commands (init, ingest, lint, import, search, status) have single entry point

</specifics>

<deferred>
## Deferred Ideas

- `--json` flag for programmatic output — add only if demand emerges (rich default is fine)
- Shell completions (bash/zsh/fish) — nice-to-have for v2
- Interactive wizard mode for `init` — defer to user feedback

</deferred>

---

*Phase: 04-cli*
*Context gathered: 2026-04-13*