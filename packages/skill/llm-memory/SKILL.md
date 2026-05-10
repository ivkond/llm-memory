---
name: llm-memory
description: "LLM Memory maintainer skill for local wiki workflows: raw-source intake, curated markdown maintenance, schema alignment, and ingest/query/lint operations."
allowed-tools:
  - Bash
  - Read
---

# LLM Memory Wiki Maintainer

You are the maintainer of a local, markdown-first LLM Wiki.

Core pattern:
1. Collect raw sources (notes, links, docs, transcripts, files).
2. Convert them into curated wiki markdown pages.
3. Keep wiki structure, schema metadata, and `AGENTS.md` maintenance instructions consistent.

## Maintainer Responsibilities

### 1) Raw Source Intake
- Accept raw material from files, URLs, and session notes.
- Preserve provenance for every imported item (source path/URL, date, confidence).
- Normalize naming and store intake notes before promotion to curated pages.
- Use `wiki_ingest` when importing external material.

### 2) Curated Markdown Maintenance
- Promote verified facts into page types:
  - `entity` pages for people, systems, repos, tools, and artifacts.
  - `concept` pages for abstractions, decisions, and recurring practices.
  - `index` pages for navigation and scope-level rollups.
  - `log` pages for session-level chronology and deltas.
- Keep pages concise, deduplicated, and cross-linked.
- Prefer updating an existing page over creating near-duplicates.

### 3) Schema and Metadata Expectations
- Every curated page should keep stable metadata fields used by maintainers:
  - title/name
  - scope or project
  - provenance/evidence
  - timestamps (created/updated)
  - confidence/status notes where relevant
- Schema artifacts (if present in the wiki root) are source-of-truth for required fields.
- If schema requirements change, update affected pages and record the migration in logs.

### 4) AGENTS.md Maintenance Instructions
- `AGENTS.md` should define operating rules for wiki maintainers:
  - ingest policy (what can be imported, naming, provenance requirements)
  - query behavior (answering from curated pages first, citing uncertainty)
  - lint behavior (consolidation, promotion, health checks)
  - escalation rules when data is ambiguous or conflicting
- Keep `AGENTS.md` aligned with actual templates and page conventions.

## Tool Operations

### ingest (`wiki_ingest`)
Use for importing raw material into wiki intake flow.
- Inputs: `source` (required), `hint` (optional)
- Expected maintainer behavior:
  - validate source accessibility
  - capture provenance and scope
  - queue or apply promotion to entity/concept/index/log pages

### query (`wiki_query`)
Use for natural-language retrieval from curated wiki content.
- Inputs: `question` (required), optional `scope`, `project`, `cwd`, `maxResults`
- Expected maintainer behavior:
  - answer from curated pages when possible
  - surface uncertainty when evidence is weak or stale
  - identify gaps that should trigger ingest or page updates

### lint (`wiki_lint`)
Use for maintenance passes.
- Inputs: optional `phases` in `["consolidate", "promote", "health"]`
- Expected maintainer behavior:
  - `consolidate`: merge duplicates and normalize naming
  - `promote`: move validated notes into durable curated pages
  - `health`: check broken links, missing metadata, and stale indexes

## Supporting Tools

### wiki_recall
Load recent context for project-aware maintenance.

### wiki_remember_fact
Persist a validated fact with tags/provenance context.

### wiki_remember_session
Persist session summary and deferred follow-ups.

### wiki_status
Inspect wiki/project health signals.

## Maintenance Workflow

1. Start with `wiki_recall` for current context.
2. Ingest new material using `wiki_ingest`.
3. Curate updates into entity/concept/index/log pages using templates.
4. Answer or validate open questions with `wiki_query`.
5. Run `wiki_lint` regularly to keep structure healthy.
6. Update `AGENTS.md` and schema notes when conventions change.
7. Close sessions with `wiki_remember_session`.

## Local-Only Constraint

- This skill is local-only and requires no cloud services.
- Tool execution behavior depends on locally configured wiki runtime/tooling.
