# LLM Wiki

Local-first personal knowledge base for AI agents. Markdown files in git are the source of truth; services are exposed via CLI and MCP.

## Local Workstation Quickstart

### Prerequisites

- Node.js 20+
- Corepack enabled (`corepack enable`)
- pnpm 10.12.4 (`corepack prepare pnpm@10.12.4 --activate`)
- Git configured with author identity (`git config --global user.name` / `git config --global user.email`)

### Install

```bash
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm install
```

### Build and verify

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

### First Run Smoke Check

```bash
pnpm --filter @llm-wiki/cli build
node packages/cli/dist/index.js init ~/.llm-wiki
node packages/cli/dist/index.js status --wiki ~/.llm-wiki --verbose
```

Expected result on a fresh wiki:
- `init` succeeds and creates `.config`, `.local`, `wiki/`, and `projects/`.
- `status` succeeds with `Total pages: 0`.
- `Index health` can be `missing` until content is ingested/indexed.

## CLI Usage

Build CLI first:

```bash
pnpm --filter @llm-wiki/cli build
```

Run CLI directly from the built package:

```bash
node packages/cli/dist/index.js --help
```

Initialize a wiki (default path is `~/.llm-wiki`):

```bash
node packages/cli/dist/index.js init
# or a custom path
node packages/cli/dist/index.js init ./my-wiki
```

Core commands:

```bash
node packages/cli/dist/index.js ingest <file-or-url> --wiki <path>
node packages/cli/dist/index.js lint --wiki <path>
node packages/cli/dist/index.js import --agent claude-code --wiki <path>
node packages/cli/dist/index.js search "your query" --wiki <path>
node packages/cli/dist/index.js status --wiki <path>
```

Skill commands:

```bash
node packages/cli/dist/index.js skill install llm-memory
node packages/cli/dist/index.js skill list
node packages/cli/dist/index.js skill uninstall llm-memory
```

Installed skills are stored in:
- `.agent_context/skills/<name>/`
- `.agent_context/skills.json`

## MCP Server Usage

Build MCP server first:

```bash
pnpm --filter @llm-wiki/mcp-server build
```

Start server:

```bash
LLM_WIKI_PATH=<path-to-wiki> node packages/mcp-server/dist/main.js
```

Default bind comes from wiki config (`mcp.host`/`mcp.port`); `llm-wiki init` defaults to `127.0.0.1:7849`.

Exposed MCP tools:

- `wiki_query`
- `wiki_recall`
- `wiki_remember_fact`
- `wiki_remember_session`
- `wiki_ingest`
- `wiki_lint`
- `wiki_status`

## Environment Variables

Configuration is loaded from `.config/settings.shared.yaml` and `.config/settings.local.yaml`, then overridden by environment variables.

Common variables:

- `LLM_WIKI_PATH`
- `LLM_WIKI_LLM_API_KEY`
- `LLM_WIKI_LLM_MODEL`
- `LLM_WIKI_LLM_BASE_URL`
- `LLM_WIKI_EMBEDDING_API_KEY`
- `LLM_WIKI_EMBEDDING_MODEL`
- `LLM_WIKI_EMBEDDING_BASE_URL`

## Claude Hooks and Skills

Repository hooks:

- `.claude/hooks/recall-context.sh`
- `.claude/hooks/summarize-session.sh`

Smoke test:

```bash
./.claude/hooks/tests/smoke.sh
```

Repository skills are in `.claude/skills/`.

## Scope

This project targets local workstation use only. There is no server deployment target in this repository.

## Troubleshooting

- `pnpm: command not found`:
  run `corepack enable && corepack prepare pnpm@10.12.4 --activate` and re-open your shell.
- `Git author identity is not configured` during `init`:
  configure git once with:
  `git config --global user.name "Your Name"`
  `git config --global user.email "you@example.com"`
- `Error: No wiki found`:
  initialize a wiki with `node packages/cli/dist/index.js init` or pass `--wiki <path>`.
- `Invalid LLM_WIKI_MCP_PORT`:
  set `LLM_WIKI_MCP_PORT` to an integer in `1..65535`.
- Missing LLM/embedding API keys:
  set `LLM_WIKI_LLM_API_KEY` and `LLM_WIKI_EMBEDDING_API_KEY` before commands that call providers.
