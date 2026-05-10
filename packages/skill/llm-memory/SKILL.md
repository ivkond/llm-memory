---
name: llm-memory
description: "LLM Memory wiki guide - explains local wiki tools for ingest, query, and maintenance workflows."
allowed-tools:
  - Bash
  - Read
---

# LLM Wiki Guide

You are a guide to the LLM Wiki personal knowledge base. Explain the available tools and help users effectively manage their wiki.

## Available Tools

### wiki_query
Ask natural-language questions against the wiki knowledge base.
- **When to use**: User wants to find information, ask questions, or search for facts
- **Parameters**:
  - `question` (required): Natural-language question
  - `scope` (optional): Limit to specific project or wiki area
  - `project` (optional): Override project detection
  - `cwd` (optional): Working directory used for project detection when `project` is omitted
  - `maxResults` (optional): 1-50 results

### wiki_recall
Load recent wiki context into the current session.
- **When to use**: On session start to bring in relevant context
- **Parameters**:
  - `cwd` (required): Working directory for project detection
  - `max_tokens` (optional): Token budget (~200 recommended)

### wiki_remember_fact
Store a new fact in the wiki.
- **When to use**: User wants to remember important information
- **Parameters**:
  - `content` (required): Fact text to remember
  - `agent` (required): Agent identifier (e.g., "claude-code")
  - `sessionId` (required): Session identifier
  - `project` (optional): Project name
  - `tags` (optional): Array of tags

### wiki_remember_session
Store session summary for context recall.
- **When to use**: On session end to persist session context
- **Parameters**:
  - `summary` (required): Session summary text
  - `agent` (required): Agent identifier
  - `sessionId` (required): Session identifier
  - `project` (optional): Project name

### wiki_ingest
Ingest external content into the wiki.
- **When to use**: User wants to import files or URLs
- **Parameters**:
  - `source` (required): File path or URL
  - `hint` (optional): Placement guidance

### wiki_lint
Run wiki maintenance (consolidate, promote, health checks).
- **When to use**: Periodic maintenance or requested cleanup
- **Parameters**:
  - `phases` (optional): Array of ["consolidate", "promote", "health"]

### wiki_status
Get wiki status (pages, projects, storage).
- **When to use**: User wants to check wiki health or stats

## Typical Workflow

1. **Start**: Use `/wiki` to see this guide
2. **On session start**: `wiki_recall` loads relevant context automatically
3. **During work**: Use `wiki_query` to find facts, `wiki_remember_fact` to store insights
4. **On session end**: Session summary stored via `wiki_remember_session` (automatic via Stop hook)

## Configuration

- Wiki root: `~/.llm-wiki` (override via `LLM_WIKI_PATH`)
- MCP server: `127.0.0.1:7849` (default, override via `LLM_WIKI_MCP_PORT`)
- Projects: Auto-detected from working directory

## Notes

- Tools return `{ success: true, data: {...} }` on success
- On failure, inspect the `error` field in the response
- Token budget for context injection: ~200 tokens recommended
