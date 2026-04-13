#!/usr/bin/env bash
# Claude Code Stop hook - stores session summary via wiki_remember_session
# Input: JSON from stdin (session_id, transcript_path, stop_hook_active)
# CRITICAL: Must check stop_hook_active to prevent infinite loops!

set -e

# Configuration
MCP_PORT="${LLM_WIKI_MCP_PORT:-7849}"

# Read input from stdin
INPUT_JSON=""
if [ -t 0 ]; then
  # No stdin - may be running directly, not from Claude Code
  # Use environment variables as fallback
  SESSION_ID="${CLAUDE_SESSION_ID:-manual}"
  STOP_HOOK_ACTIVE="false"
else
  # Read all stdin
  INPUT_JSON=$(cat)
  
  # Parse input JSON
  SESSION_ID=$(echo "$INPUT_JSON" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"session_id"[[:space:]]*:[[:space:]]*"\(.*\)"/\1/')
  STOP_HOOK_ACTIVE=$(echo "$INPUT_JSON" | grep -o '"stop_hook_active"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | sed 's/"stop_hook_active"[[:space:]]*:[[:space:]]*//')
fi

# CRITICAL: Check stop_hook_active to prevent infinite loops
if [ "$STOP_HOOK_ACTIVE" != "true" ]; then
  exit 0
fi

# Get current working directory (project detection)
CWD="${CLAUDE_CWD:-$(pwd)}"

# Get transcript path from input
TRANSCRIPT_PATH=$(echo "$INPUT_JSON" | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"transcript_path"[[:space:]]*:[[:space:]]*"\(.*\)"/\1/')

# Parse transcript for key information
FILES_READ=""
COMMANDS_RUN=""

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Extract files read (grep for Read tool invocations)
  FILES_READ=$(grep -o '"tool"[[:space:]]*:[[:space:]]*"Read"' "$TRANSCRIPT_PATH" 2>/dev/null | wc -l | tr -d ' ')
  
  # Extract commands run (grep for Bash tool invocations)
  COMMANDS_RUN=$(grep -o '"tool"[[:space:]]*:[[:space:]]*"Bash"' "$TRANSCRIPT_PATH" 2>/dev/null | wc -l | tr -d ' ')
fi

# Generate summary
SUMMARY="Session $(date '+%Y-%m-%d %H:%M'): "
[ -n "$FILES_READ" ] && [ "$FILES_READ" -gt 0 ] && SUMMARY="${SUMMARY}${FILES_READ} files read, "
[ -n "$COMMANDS_RUN" ] && [ "$COMMANDS_RUN" -gt 0 ] && SUMMARY="${SUMMARY}${COMMANDS_RUN} commands run"
[ "$SUMMARY" == "Session $(date '+%Y-%m-%d %H:%M'): " ] && SUMMARY="${SUMMARY}No files accessed"

# Build JSON-RPC request
RPC_REQUEST=$(
  cat <<EOF
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "wiki_remember_session",
    "arguments": {
      "summary": "$SUMMARY",
      "agent": "claude-code",
      "sessionId": "$SESSION_ID",
      "project": "$CWD"
    }
  },
  "id": 1
}
EOF
)

# Call MCP server (silent fail if not running)
curl -s -X POST "http://localhost:${MCP_PORT}/mcp" \
  -H "Content-Type: application/json" \
  -d "$RPC_REQUEST" >/dev/null 2>&1 || {
  # MCP server not running - exit silently
  exit 0
}

exit 0