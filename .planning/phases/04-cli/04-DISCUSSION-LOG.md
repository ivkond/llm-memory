# Phase 4: CLI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 04-cli
**Areas discussed:** CLI Framework, Output Format, Config Location, Interactive Prompts, Subcommand Style

---

## CLI Framework

| Option | Description | Selected |
|--------|-------------|----------|
| Cliffy (Recommended) | Native Deno heritage, mature for Node, excellent TypeScript support, built-in chalk/colors | ✓ |
| Yargs | Oldest, battle-tested, wider docs - but ESM + TS support is dated | |
| Commander + Chalk | Simple parser + manual colors, more boilerplate but predictable | |
| Pure parseArgs | No deps, use Node's built-in parseArgs — minimal but no subcommands | |

**User's choice:** Cliffy (Recommended)
**Notes:** Best fit for existing stack (pure TypeScript, ESM, Node 20+), avoids YAGNI additions

---

## Output Format

| Option | Description | Selected |
|--------|-------------|----------|
| Rich with colors (Recommended) | Colors, tables, progress bars — great for interactive terminal | ✓ |
| Plain text | No formatting, easy to parse by scripts | |
| JSON output | Full JSON for programmatic consumption, --pretty flag for humans | |
| User chooses | Default rich, --json/--plain flags override | |

**User's choice:** Rich with colors (Recommended)
**Notes:** CLI primary use is interactive terminal; scripts can pipe/parse if needed

---

## Config Location

| Option | Description | Selected |
|--------|-------------|----------|
| Local only (Recommended) | ~/.llm-wiki/config.yaml — project-specific in repo .wiki/config.yaml | |
| Local + Global | Both, with local overriding global | ✓ |
| Env only | All via env vars, no config files | |
| Wiki directory | All config in wiki directory (.llm-wiki/ in project) | |

**User's choice:** Local + Global, but needs to follow XDG Base Directory convention
**Notes:** Global: ~/.config/llm-wiki/config.yaml (or $XDG_CONFIG_HOME/llm-wiki/config.yaml), Global data: ~/.cache/llm-wiki/ for index/vectors, Local: <wiki>/.llm-wiki/config.yaml for per-project overrides

---

## Interactive Prompts

| Option | Description | Selected |
|--------|-------------|----------|
| Interactive prompts (Recommended) | Ask missing input — better UX for CLI usage | ✓ |
| Fail with error | Require all params upfront — better for scripting | |

**User's choice:** Interactive prompts (Recommended)
**Notes:** User preference for rich CLI experience, fallback in non-TTY with helpful error

---

## Subcommand Style

| Option | Description | Selected |
|--------|-------------|----------|
| llm-wiki <cmd> (Recommended) | Unified entry: llm-wiki init, llm-wiki ingest — shares config and services better | ✓ |
| Separate commands | llm-wiki-init, llm-wiki-ingent — more traditional, easier to discover | |

**User's choice:** llm-wiki <cmd> (Recommended)
**Notes:** Single binary, shares connection pool, common flags, better DX

---

## Deferred Ideas

- `--json` flag for programmatic output — add only if demand emerges
- Shell completions (bash/zsh/fish) — nice-to-have for v2
- Interactive wizard mode for `init` — defer to user feedback