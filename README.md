# LLM Memory

LLM Memory is a local-first memory layer for AI agents and developer tools. It gives an assistant a durable knowledge base it can write to, search, and reuse across sessions without relying on a hosted service.

The project follows Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) idea: keep long-term knowledge as plain Markdown files, let LLMs help structure and maintain it, and use search/retrieval to bring the right context back when needed.

## What it is for

Use LLM Memory when you want an AI agent to:

- remember facts, decisions, and session summaries between runs;
- build a searchable personal or project knowledge base;
- ingest documents, notes, files, or URLs into structured Markdown pages;
- retrieve relevant context through CLI or MCP-compatible clients;
- keep all memory local, inspectable, versioned, and editable by hand.

The repository is designed for local workstation use. Your knowledge base lives on disk, in Git, as Markdown.

## How it works

At a high level, LLM Memory combines a few simple pieces:

```text
User / Agent
    │
    ├── CLI commands: llm-wiki init, ingest, search, lint, status
    └── MCP tools: wiki_query, wiki_recall, wiki_remember_*, ...
            │
            ▼
      Core services
            │
            ├── Markdown files as source of truth
            ├── Git for history and transactional updates
            ├── LLM for extraction, consolidation, and answers
            └── Hybrid search: BM25 + embeddings
```

### Storage model

A wiki directory contains:

```text
~/.llm-wiki/
  .config/
    settings.shared.yaml      # main configuration
  .local/
    state.yaml                # runtime state
    search.db/                # local search index
  wiki/                       # global curated knowledge
  projects/                   # project-scoped knowledge
  log/                        # raw remembered facts and session summaries
```

The important part: **Markdown files are the source of truth**. Search indexes and runtime state can be rebuilt; the knowledge itself remains readable and editable.

### Under the hood

LLM Memory uses:

- **Markdown + Git** for durable, auditable knowledge storage.
- **LLM calls** for turning sources into wiki pages, consolidating raw notes, and producing natural-language answers.
- **Embeddings** for semantic search.
- **MiniSearch/BM25** for lexical search.
- **Hybrid retrieval** to combine semantic and keyword matching.
- **MCP server** to expose memory tools to compatible AI clients.
- **CLI** for direct local operation.

## Quick start

### 1. Prerequisites

You need:

- Node.js 20+
- npm
- Git with author identity configured:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 2. Install from npm

Install the CLI and MCP server globally:

```bash
npm install -g @ivkond-llm-wiki/cli @ivkond-llm-wiki/mcp-server
```

This provides two commands:

```bash
llm-wiki --help
llm-wiki-mcp
```

You can also run the CLI without global installation:

```bash
npx -y @ivkond-llm-wiki/cli --help
```

### 3. Initialize a wiki

Create the default wiki at `~/.llm-wiki`:

```bash
llm-wiki init
```

Or choose a custom location:

```bash
llm-wiki init ./my-wiki
```

### 4. Configure models

By default, the generated config uses OpenAI-compatible LLM and embedding models:

- LLM: `gpt-4o-mini`
- Embeddings: `text-embedding-3-small`

Set API keys with environment variables:

```bash
export LLM_WIKI_LLM_API_KEY="your-key"
export LLM_WIKI_EMBEDDING_API_KEY="your-key"
```

Or edit:

```text
~/.llm-wiki/.config/settings.shared.yaml
```

### 5. Check status

```bash
llm-wiki status
```

On a new wiki you should see zero pages and an index status such as `missing` until content is ingested.

### 6. Add knowledge

Ingest a local file:

```bash
llm-wiki ingest ./notes.md
```

Ingest a URL:

```bash
llm-wiki ingest https://example.com/article
```

LLM Memory will extract durable reference pages, write them as Markdown, commit the changes, and update the search index.

### 7. Search the wiki

```bash
llm-wiki search "What did we decide about the release process?"
```

For machine-readable output:

```bash
llm-wiki search "release process" --format json
```

### 8. Run the MCP server

Start the server for MCP-compatible clients:

```bash
LLM_WIKI_PATH=~/.llm-wiki llm-wiki-mcp
```

By default, the server listens on `127.0.0.1:7849`. You can change this in config or with environment variables.

## CLI reference

| Command | Purpose |
| --- | --- |
| `llm-wiki init [directory]` | Create a new wiki directory and Git repository. |
| `llm-wiki status` | Show wiki health, page counts, index status, and recent activity. |
| `llm-wiki ingest <file-or-url>` | Convert a file or URL into structured wiki pages. |
| `llm-wiki search <query>` | Search the wiki and optionally generate an answer. |
| `llm-wiki lint` | Consolidate raw memories, promote shared patterns, and run health checks. |
| `llm-wiki import --agent claude-code` | Import supported external agent memory sources. |
| `llm-wiki skill install <name>` | Install packaged agent skills into `.agent_context/skills`. |

Useful global options:

```bash
llm-wiki status --wiki ./my-wiki
llm-wiki search "query" --limit 5 --format json
llm-wiki ingest ./doc.md --idempotency-key ingest-doc-20260510 --verbose
```

## MCP tools

The MCP server exposes these tools:

| Tool | Purpose |
| --- | --- |
| `wiki_query` | Ask a natural-language question against the indexed wiki. |
| `wiki_recall` | Retrieve relevant wiki context for a working directory. |
| `wiki_remember_fact` | Store a raw fact for later consolidation. |
| `wiki_remember_session` | Store a session summary with deduplication by session ID. |
| `wiki_ingest` | Ingest a file path or URL into wiki pages. |
| `wiki_lint` | Run consolidation, promotion, and health phases. |
| `wiki_status` | Return wiki health and metadata. |

Write operations accept an optional `idempotencyKey` (MCP) or `--idempotency-key` (CLI for `ingest`, `lint`, and `import`).
Retries with the same key and identical request replay the previous result. Reusing a key with different input returns an idempotency conflict.

## Configuration

Configuration is loaded in this order:

1. built-in defaults;
2. `.config/settings.shared.yaml` inside the wiki;
3. `.local/settings.local.yaml` inside the wiki;
4. environment variables.

Common environment variables:

| Variable | Purpose |
| --- | --- |
| `LLM_WIKI_PATH` | Wiki directory path. |
| `LLM_WIKI_LLM_API_KEY` | API key for the LLM provider. |
| `LLM_WIKI_LLM_MODEL` | LLM model name. |
| `LLM_WIKI_LLM_BASE_URL` | OpenAI-compatible LLM base URL. |
| `LLM_WIKI_EMBEDDING_API_KEY` | API key for the embedding provider. |
| `LLM_WIKI_EMBEDDING_MODEL` | Embedding model name. |
| `LLM_WIKI_EMBEDDING_BASE_URL` | OpenAI-compatible embedding base URL. |
| `LLM_WIKI_MCP_HOST` | MCP server host. |
| `LLM_WIKI_MCP_PORT` | MCP server port. |

Example:

```bash
export LLM_WIKI_PATH="$HOME/.llm-wiki"
export LLM_WIKI_LLM_API_KEY="your-key"
export LLM_WIKI_EMBEDDING_API_KEY="your-key"
llm-wiki status
```

## Data ownership and privacy

LLM Memory is local-first:

- wiki content is stored as local Markdown files;
- changes are committed to a local Git repository;
- search indexes are stored under the wiki directory;
- there is no hosted backend in this project.

Content sent to LLM or embedding providers depends on the commands you run and the provider configuration you choose. If you use a remote API provider, relevant source text, queries, or excerpts may be sent to that provider.

## Troubleshooting

### `llm-wiki: command not found`

Install the CLI globally:

```bash
npm install -g @ivkond-llm-wiki/cli
```

Or use `npx`:

```bash
npx -y @ivkond-llm-wiki/cli --help
```

### `Git author identity is not configured`

Configure Git once:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### `Error: No wiki found`

Initialize a wiki first:

```bash
llm-wiki init
```

Or pass the path explicitly:

```bash
llm-wiki status --wiki ./my-wiki
```

### Missing API keys

Set both LLM and embedding keys before commands that call providers:

```bash
export LLM_WIKI_LLM_API_KEY="your-key"
export LLM_WIKI_EMBEDDING_API_KEY="your-key"
```

### Invalid MCP port

Use an integer between `1` and `65535`:

```bash
export LLM_WIKI_MCP_PORT=7849
```

## Status

LLM Memory is currently aimed at local workstation usage. It is best suited for users who want a transparent, hackable, Git-backed memory system for AI agents and personal knowledge workflows.
