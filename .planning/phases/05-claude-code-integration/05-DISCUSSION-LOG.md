# Phase 5: Claude Code Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 05-claude-code-integration
**Areas discussed:** Hook mechanism, Context injection, Session summarization, /wiki skill

---

## Hook Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Direct MCP HTTP calls | Claude Code loads .claude/hooks.yml with start/stop commands calling the MCP server via HTTP | ✓ |
| MCP stdio transport | MCP server also exposes stdio transport, Claude Code uses stdio | |
| Wrapper package | New @llm-wiki/claude-code package wraps MCP client, called by hooks | |

**User's choice:** Direct MCP HTTP calls
**Notes:** Simplest integration, no wrapper package needed, works with existing MCP server from Phase 1. "Use reasonable defaults" was selected for initial gray area selection.

---

## Project Detection

| Option | Description | Selected |
|--------|-------------|----------|
| cwd | Extract project from current working directory where Claude Code runs | |
| env variable | Claude Code can read an environment variable if user sets it | |
| cwd -> project config -> fault | Primary: cwd, fallback: project config, fault if none | ✓ |

**User's choice:** cwd -> project config -> fault
**Notes:** Cascade approach provides best reliability with clear fallbacks.

---

## Context Injection

| Option | Description | Selected |
|--------|-------------|----------|
| System prompt preamble | Inject as a system prompt preamble with ~500 token budget | |
| System prompt preamble (~100-250 tokens) | System prompt preamble with reduced token budget | ✓ |
| Claude Code native context | Claude Code's native context injection mechanism | |

**User's choice:** System prompt preamble, but ~100-250 tokens (with references)
**Notes:** User explicitly reduced token budget from initial ~500 to 100-250 for efficiency. "References" indicate source citations in the injected context.

---

## Session Summarization

| Option | Description | Selected |
|--------|-------------|----------|
| LLM summarization | Use LLM to generate a summary from conversation history (more accurate, higher quality) | ✓ |
| Simple heuristics | Simple heuristics: count of files read, commands run, errors encountered | |
| Manual invocation | Manual: user must explicitly call /wiki save to persist session | |

**User's choice:** LLM summarization, if LLM is not available (connection error, timeout, etc.) -> simple heuristic and user feedback
**Notes:** User wants quality but with graceful degradation. Fallback to heuristics + user feedback when LLM unavailable.

---

## /wiki Skill Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Slash command package | Standalone package that Claude Code can load via /slash command | |
| Documentation file | Just documentation that explains available MCP tools | |
| Hybrid | Both: a package for /wiki and fallback to docs | ✓ |

**User's choice:** Hybrid
**Notes:** Best of both worlds — rich interaction when package available, always works as documentation.

---

## Claude's Discretion

Areas where user deferred to the agent:
- Exact token budget within 100-250 range
- Hook script location (`.claude/hooks.yml` in standard location)
- Summary prompt structure
- Documentation file location
