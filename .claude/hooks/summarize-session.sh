#!/usr/bin/env bash
# Claude Code Stop hook - stores session summary via wiki_remember_session
# Input: JSON from stdin (session_id, transcript_path, stop_hook_active)
# CRITICAL: Must check stop_hook_active to prevent infinite loops!

set -e

MCP_PORT="${LLM_WIKI_MCP_PORT:-7849}"
INPUT_JSON=""
SESSION_ID="${CLAUDE_SESSION_ID:-manual}"
STOP_HOOK_ACTIVE="false"
TRANSCRIPT_PATH=""

if [ ! -t 0 ]; then
  INPUT_JSON=$(cat)

  PARSED=$(printf '%s' "$INPUT_JSON" | node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(raw);
    const sessionId = typeof parsed?.session_id === "string" ? parsed.session_id : "";
    const stopHookActive = parsed?.stop_hook_active === true ? "true" : "false";
    const transcriptPath = typeof parsed?.transcript_path === "string" ? parsed.transcript_path : "";
    process.stdout.write(JSON.stringify({ sessionId, stopHookActive, transcriptPath }));
  } catch {
    process.stdout.write(JSON.stringify({ sessionId: "", stopHookActive: "false", transcriptPath: "" }));
  }
});
')

  SESSION_ID=$(printf '%s' "$PARSED" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).sessionId')
  STOP_HOOK_ACTIVE=$(printf '%s' "$PARSED" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).stopHookActive')
  TRANSCRIPT_PATH=$(printf '%s' "$PARSED" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).transcriptPath')
fi

if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

CWD="${CLAUDE_CWD:-$(pwd)}"

FILES_READ=0
COMMANDS_RUN=0

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  FILES_READ=$(grep -o '"tool"[[:space:]]*:[[:space:]]*"Read"' "$TRANSCRIPT_PATH" 2>/dev/null | wc -l | tr -d ' ')
  COMMANDS_RUN=$(grep -o '"tool"[[:space:]]*:[[:space:]]*"Bash"' "$TRANSCRIPT_PATH" 2>/dev/null | wc -l | tr -d ' ')
fi

SUMMARY="Session $(date '+%Y-%m-%d %H:%M'): "
if [ "$FILES_READ" -gt 0 ] || [ "$COMMANDS_RUN" -gt 0 ]; then
  [ "$FILES_READ" -gt 0 ] && SUMMARY="${SUMMARY}${FILES_READ} files read"
  [ "$FILES_READ" -gt 0 ] && [ "$COMMANDS_RUN" -gt 0 ] && SUMMARY="${SUMMARY}, "
  [ "$COMMANDS_RUN" -gt 0 ] && SUMMARY="${SUMMARY}${COMMANDS_RUN} commands run"
else
  SUMMARY="${SUMMARY}No files accessed"
fi

RPC_REQUEST=$(node -e '
const [summary, sessionId, project] = process.argv.slice(1);
const payload = {
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "wiki_remember_session",
    arguments: {
      summary,
      agent: "claude-code",
      sessionId,
      project,
    },
  },
  id: 1,
};
process.stdout.write(JSON.stringify(payload));
' "$SUMMARY" "$SESSION_ID" "$CWD")

curl -s -X POST "http://localhost:${MCP_PORT}/mcp" \
  -H "Content-Type: application/json" \
  -d "$RPC_REQUEST" >/dev/null 2>&1 || exit 0

exit 0
