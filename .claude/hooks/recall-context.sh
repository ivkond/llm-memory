#!/usr/bin/env bash
# Claude Code SessionStart hook - loads wiki context via wiki_recall
# Output: markdown context for injection into Claude session
# Token budget: ~800 chars (~200 tokens)

set -e

MCP_PORT="${LLM_WIKI_MCP_PORT:-7849}"
MAX_CHARS=800
CWD="${CLAUDE_CWD:-$(pwd)}"

RPC_REQUEST=$(node -e '
const cwd = process.argv[1];
const payload = {
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "wiki_recall",
    arguments: {
      cwd,
      max_tokens: 200,
    },
  },
  id: 1,
};
process.stdout.write(JSON.stringify(payload));
' "$CWD")

RESPONSE=$(curl -s -X POST "http://localhost:${MCP_PORT}/mcp" \
  -H "Content-Type: application/json" \
  -d "$RPC_REQUEST" 2>/dev/null) || exit 0

TEXT=$(printf '%s' "$RESPONSE" | node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(raw);
    const text = parsed?.result?.content?.find((item) => item?.type === "text")?.text;
    if (typeof text === "string") process.stdout.write(text);
  } catch {
    // Invalid JSON response: hook should fail silently.
  }
});
')

[ -z "$TEXT" ] && exit 0

INNER=$(printf '%s' "$TEXT" | node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      process.stdout.write(JSON.stringify(parsed));
      return;
    }
  } catch {
    // Not JSON, return as-is.
  }
  process.stdout.write(raw);
});
')

[ -z "$INNER" ] && exit 0
[ "$INNER" = "{}" ] && exit 0

if [ ${#INNER} -gt $MAX_CHARS ]; then
  INNER="${INNER:0:$MAX_CHARS}..."
fi

echo "## Wiki Context"
echo "$INNER"
