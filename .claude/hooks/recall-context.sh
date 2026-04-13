#!/usr/bin/env bash
# Claude Code SessionStart hook - loads wiki context via wiki_recall
# Output: markdown context for injection into Claude session
# Token budget: ~800 chars (~200 tokens)

set -e

# Configuration
MCP_PORT="${LLM_WIKI_MCP_PORT:-7849}"
MAX_CHARS=800

# Get current working directory (project detection)
CWD="${CLAUDE_CWD:-$(pwd)}"

# Build JSON-RPC request
RPC_REQUEST=$(
  cat <<EOF
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "wiki_recall",
    "arguments": {
      "cwd": "$CWD",
      "max_tokens": 200
    }
  },
  "id": 1
}
EOF
)

# Call MCP server
RESPONSE=$(curl -s -X POST "http://localhost:${MCP_PORT}/mcp" \
  -H "Content-Type: application/json" \
  -d "$RPC_REQUEST" 2>/dev/null) || {
  # MCP server not running - exit silently
  exit 0
}

# Extract result from JSON-RPC response
# Response format: { "result": { "content": [{ "type": "text", "text": "..." }] } }
TEXT=$(echo "$RESPONSE" | grep -o '"text"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"text"[[:space:]]*:[[:space:]]*"\(.*\)"/\1/' | sed 's/\\"/"/g') || {
  exit 0
}

# Parse inner JSON (wiki_recall returns { success: true, data: {...} })
INNER=$(echo "$TEXT" | grep -o '{[^}]*}' | head -1) || INNER="$TEXT"

# Format as markdown context
if [ -n "$INNER" ] && [ "$INNER" != "{}" ]; then
  # Truncate to token budget
  if [ ${#INNER} -gt $MAX_CHARS ]; then
    INNER="${INNER:0:$MAX_CHARS}..."
  fi
  
  echo "## Wiki Context"
  echo "$INNER"
fi