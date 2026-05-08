#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RECALL_SCRIPT="$ROOT_DIR/.claude/hooks/recall-context.sh"
SUMMARIZE_SCRIPT="$ROOT_DIR/.claude/hooks/summarize-session.sh"

TMPDIR_TEST="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_TEST"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local msg="$3"
  [ "$actual" = "$expected" ] || fail "$msg (actual=$actual expected=$expected)"
}

make_mock_curl() {
  local mode="$1"
  local body="$2"
  local out_path="$3"
  local dir="$TMPDIR_TEST/bin-$mode"
  mkdir -p "$dir"
  cat > "$dir/curl" <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
out_file="$out_path"
mode="$mode"
body='$body'
payload=""
while [ "\$#" -gt 0 ]; do
  case "\$1" in
    -d)
      shift
      payload="\${1:-}"
      ;;
  esac
  shift || true
done
printf '%s' "\$payload" > "\$out_file"
if [ "\$mode" = "fail" ]; then
  exit 7
fi
printf '%s' "\$body"
SCRIPT
  chmod +x "$dir/curl"
  echo "$dir"
}

# 1) recall hook silent-fails when MCP unavailable
payload1="$TMPDIR_TEST/payload1.json"
mock_fail_bin="$(make_mock_curl fail '' "$payload1")"
out="$(PATH="$mock_fail_bin:$PATH" CLAUDE_CWD='/tmp/p' "$RECALL_SCRIPT")"
assert_eq "$out" "" "recall hook should produce no output when MCP is unavailable"

# 2) recall hook sends valid escaped JSON request even with quotes/newlines in cwd
payload2="$TMPDIR_TEST/payload2.json"
response2='{"result":{"content":[{"type":"text","text":"{}"}]}}'
mock_ok_bin="$(make_mock_curl ok "$response2" "$payload2")"
PATH="$mock_ok_bin:$PATH" CLAUDE_CWD=$'bad"cwd\nline' "$RECALL_SCRIPT" >/dev/null
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (payload?.params?.arguments?.cwd !== "bad\"cwd\nline") process.exit(1);
if (payload?.params?.name !== "wiki_recall") process.exit(2);
' "$payload2" || fail "recall hook payload must be valid JSON with escaped cwd"

# 3) recall output is truncated to max chars + ellipsis
payload3="$TMPDIR_TEST/payload3.json"
long_text=$(node -e 'process.stdout.write("x".repeat(1005))')
response3=$(node -e 'const txt = process.argv[1]; process.stdout.write(JSON.stringify({result:{content:[{type:"text", text: txt}]}}));' "$long_text")
mock_ok_bin2="$(make_mock_curl ok "$response3" "$payload3")"
out3="$(PATH="$mock_ok_bin2:$PATH" CLAUDE_CWD='/tmp/p' "$RECALL_SCRIPT")"
line2="$(printf '%s\n' "$out3" | sed -n '2p')"
len2=$(printf '%s' "$line2" | wc -c | tr -d ' ')
assert_eq "$len2" "803" "recall context line should truncate to 800 chars plus ellipsis"

# 4) stop hook payload shape is valid and safely escaped for normal stop_hook_active=false events
payload4="$TMPDIR_TEST/payload4.json"
mock_stop_bin="$(make_mock_curl ok '{}' "$payload4")"
input4='{"session_id":"sess-\"quoted\"","stop_hook_active":false,"transcript_path":"/no/such/file"}'
printf '%s' "$input4" | PATH="$mock_stop_bin:$PATH" CLAUDE_CWD=$'proj"x' "$SUMMARIZE_SCRIPT"
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (payload?.method !== "tools/call") process.exit(1);
if (payload?.params?.name !== "wiki_remember_session") process.exit(2);
const args = payload?.params?.arguments;
if (!args || typeof args.summary !== "string" || !args.summary.startsWith("Session ")) process.exit(3);
if (args.agent !== "claude-code") process.exit(4);
if (args.sessionId !== "sess-\"quoted\"") process.exit(5);
if (args.project !== "proj\"x") process.exit(6);
' "$payload4" || fail "stop hook payload must match wiki_remember_session schema and preserve escaping"

# 5) stop hook loop guard prevents MCP calls when stop_hook_active is true
payload5="$TMPDIR_TEST/payload5.json"
mock_guard_bin="$(make_mock_curl ok '{}' "$payload5")"
printf '%s' '{"session_id":"s1","stop_hook_active":true}' | PATH="$mock_guard_bin:$PATH" "$SUMMARIZE_SCRIPT"
[ ! -s "$payload5" ] || fail "stop hook must not call MCP when stop_hook_active is true"

echo "ok - hook smoke tests passed"
