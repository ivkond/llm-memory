# Phase 5: Claude Code Integration - Research

**Researched:** 2026-04-13
**Status:** Complete

---

## Research Questions

1. **Claude Code hooks.yml format/spec** — How to configure SessionStart and Stop hooks?
2. **Skill loading mechanism** — How to create a `/wiki` guide skill?
3. **MCP HTTP calls from hooks** — How to call MCP server from shell hooks?
4. **Token budget optimization** — How to optimize context injection within 100-250 tokens?
5. **Context injection mechanisms** — How to inject context into Claude sessions?

---

## Findings

### 1. Claude Code Hooks Configuration

**Configuration file locations:**

| Scope | File Path | Shareable |
|-------|-----------|-----------|
| Project | `.claude/settings.json` | Yes (commit to Git) |
| User | `~/.claude/settings.json` | No |
| Local | `.claude/settings.local.json` | No |

**Hook events relevant to this phase:**

| Event | When It Fires | Can Block? | Use Case |
|-------|--------------|------------|----------|
| `SessionStart` | Session begins or resumes | NO | Load context, set env vars |
| `Stop` | Claude finishes responding | YES | Run final actions, verify completion |
| `SessionEnd` | Session terminates | NO | Cleanup, logging |

**SessionStart input payload:**
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "hook_event_name": "SessionStart",
  "source": "startup",  // or "resume", "clear", "compact"
  "model": "claude-sonnet-4-6"
}
```

**SessionStart context injection:**
- Stdout from command hooks is automatically added as context
- Can return JSON with `additionalContext` field for structured injection
- Can persist environment variables via `CLAUDE_ENV_FILE`

**Stop hook input:**
```json
{
  "session_id": "abc123",
  "hook_event_name": "Stop",
  "stop_hook_active": true,  // MUST check to prevent infinite loops
  "transcript_path": "..."
}
```

**Hook types:**
- `command` — Shell command, stdout becomes context
- `http` — POST to HTTP endpoint, receive JSON (added Feb 2026)
- `prompt` — LLM prompt for conditional decisions
- `agent` — Spawn subagent for complex verification

**Hook configuration structure:**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",  // optional: startup, resume, clear, compact
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"additionalContext\": \"...\"}'"
          }
        ]
      }
    ]
  }
}
```

### 2. Claude Code Skills

**Skill directory structure:**
```
.claude/skills/
└── wiki/
    ├── SKILL.md           # Required - skill definition
    └── (optional files)   # templates, scripts, etc.
```

**SKILL.md format:**
```yaml
---
name: wiki
description: "LLM Wiki guide - explains available MCP tools and workflow. Use when user asks about wiki capabilities."
allowed-tools:
  - Read
  - Bash
context:
  - type: shell
    command: "llm-wiki status"
---

# /wiki Skill

You are a wiki guide. Explain the available MCP tools and recommended workflow...

## Available Tools

- `wiki_query` - ...
- `wiki_recall` - ...
- etc.
```

**Invocation patterns:**
- Manual: `/wiki`
- Automatic: Claude matches `description` to user request

**Key differences from commands:**
- Skills support `allowed-tools`, `context`, `agent` frontmatter
- Skills can auto-trigger based on description matching
- Skills support bundling of additional files

### 3. MCP HTTP Calls from Hooks

**Option A: Direct HTTP call (curl)**
```bash
# SessionStart hook to call wiki_recall
curl -s -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"wiki_recall","arguments":{"project":"."}},"id":1}'
```

**Option B: HTTP hook type (Claude Code Feb 2026+)**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3100/mcp",
            "method": "POST",
            "body": {
              "jsonrpc": "2.0",
              "method": "tools/call",
              "params": {
                "name": "wiki_recall",
                "arguments": {"project": "."}
              },
              "id": 1
            }
          }
        ]
      }
    ]
  }
}
```

**MCP server endpoint:**
- Phase 1 MCP server runs on configured HTTP port (e.g., 3100)
- Streamable HTTP transport at root `/` or `/mcp`
- Need to determine exact endpoint from Phase 1 implementation

### 4. Token Budget Optimization

**Target:** 100-250 tokens (per D-03)

**Token estimation:**
- 1 token ≈ 4 characters
- 100-250 tokens ≈ 400-1000 characters
- ~2-4 sentences of context

**Optimization strategies:**

1. **Truncate long output:**
   ```bash
   curl -s http://localhost:3100/mcp ... | jq -r '.result.content[0].text' | head -c 800
   ```

2. **Use summary endpoint (if exists):**
   - `wiki_recall` returns full context - may need truncation
   - Could create a lightweight summary endpoint

3. **Selective context:**
   - Only recent/important entries
   - Use `limit` parameter if available

4. **Compress output:**
   - Remove whitespace, use abbreviations
   - Strip markdown formatting

### 5. Context Injection Mechanisms

**Mechanism A: additionalContext (JSON)**
```bash
echo '{"additionalContext": "Wiki context: ..."}'
```
- Text added directly to conversation context

**Mechanism B: Stdout injection**
```bash
echo "## Wiki Context"
echo "Recent entries:"
curl ... | jq -r '.result.content[0].text'
```
- Stdout becomes context (formatted as markdown)

**Mechanism C: Environment variables (SessionStart)**
```bash
# Write to CLAUDE_ENV_FILE
echo "export WIKI_PROJECT=myproject" >> "$CLAUDE_ENV_FILE"
```
- Variables persist for entire session

---

## Implementation Options

### Hook Script Location

**Option A: Project-level (`.claude/settings.json`)**
- Pros: Version-controlled, shareable with team
- Cons: Not portable across projects

**Option B: User-level (`~/.claude/settings.json`)**
- Pros: Works in any project, one-time setup
- Cons: Not version-controlled

**Decision per D-01:** Use project-level `.claude/settings.json` for project-specific hooks

### SessionStart Approach

**Option A: Command hook with curl**
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "curl -s http://localhost:3100/mcp ... | jq -r '.result.content[0].text'"
      }]
    }]
  }
}
```
- Pros: Simple, works everywhere
- Cons: Requires MCP server running

**Option B: HTTP hook type**
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "http",
        "url": "...",
        ...
      }]
    }]
  }
}
```
- Pros: Native support, cleaner config
- Cons: Requires Claude Code Feb 2026+

**Recommendation:** Start with command hook (Option A) for maximum compatibility

### Stop Hook (Session Summary)

**Implementation:**
1. Parse transcript for key information (files read, commands run)
2. Call `wiki_remember_session` with summary
3. Handle `stop_hook_active` flag to prevent infinite loops

---

## Validation Architecture

### Validation Strategy

**Dimension 8 (Nyquist):** Verify hook execution and context injection

| Test | Method |
|------|--------|
| Hook fires on SessionStart | Test hook config in sandbox project |
| Context appears in session | Inspect initial context window |
| Token budget respected | Measure injected context size |
| Stop hook runs on completion | Trigger stop event, verify call |
| Skill loads on /wiki | Invoke skill, verify response |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MCP server not running | Medium | High | Document server requirement in hook comments |
| Token budget exceeded | Low | Medium | Add truncation to hook scripts |
| Infinite Stop loop | Medium | High | Always check `stop_hook_active` flag |
| Hooks disabled by user | Low | Medium | Document in README |

---

## Next Steps

After research, planning should cover:

1. **Hook configuration file** — Create `.claude/settings.json` with SessionStart/Stop hooks
2. **Hook scripts** — Implement shell scripts that call MCP server
3. **Token optimization** — Ensure hook output respects budget
4. **Skill definition** — Create `.claude/skills/wiki/SKILL.md`
5. **Testing** — Verify hooks fire and context injects correctly

---

## References

- Claude Code hooks docs: https://code.claude.com/docs/en/hooks
- Claude Code skills docs: https://docs.claude.com/en/docs/claude-code/slash-commands.md
- SessionStart event reference: https://claudefa.st/blog/tools/hooks/hooks-guide
- Skills tutorial: https://supalaunch.com/blog/claude-code-skills-tutorial-custom-slash-commands-and-automations-guide
- Phase 1 MCP server: `packages/mcp-server/src/server.ts`
- Phase 2 wiki_recall: `packages/core/src/services/recall-service.ts`

---

*Research completed: 2026-04-13*
