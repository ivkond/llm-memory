# @llm-wiki/skill-llm-memory

Local-only LLM Memory skill package for Multica-compatible agent runtimes.

## Purpose

This package defines a wiki maintainer workflow for the pattern:

- raw sources -> curated wiki markdown pages -> schema + `AGENTS.md` maintenance instructions

It provides:
- a maintainer-oriented `SKILL.md`
- page templates (`entity`, `concept`, `index`, `log`)
- package metadata for workspace/runtime discovery

## Expected Local Wiki Layout

The skill assumes a local wiki root (for example `~/.llm-wiki`) with a layout similar to:

```text
<wiki-root>/
  raw/
    inbox/                 # newly ingested source notes/files
    snapshots/             # preserved source snapshots or references
  pages/
    entities/              # normalized entity pages
    concepts/              # concept/decision pages
    indexes/               # navigation and scope rollups
    logs/                  # session and change chronology
  schema/
    page-schema.md         # required page fields/metadata conventions
    taxonomy.md            # optional tags/types guidance
  AGENTS.md                # maintainer operating rules (ingest/query/lint)
```

### Responsibilities by area
- `raw/`: source intake with provenance; not final truth.
- `pages/`: curated, deduplicated, cross-linked knowledge.
- `schema/`: required metadata and structure conventions.
- `AGENTS.md`: operating instructions for maintainers and runtime behavior.

## Package Files

- `SKILL.md` - maintainer instructions and operation guidance.
- `templates/entity.md` - entity page template.
- `templates/concept.md` - concept page template.
- `templates/index.md` - index page template.
- `templates/log.md` - session log template.

## Usage

1. Ensure runtime supports loading packaged skills from repository paths.
2. Load `packages/skill/llm-memory/SKILL.md`.
3. Use templates in `packages/skill/llm-memory/templates/` to create curated pages.
4. Operate with the maintainer loop:
   - ingest with `wiki_ingest`
   - curate/update pages
   - query with `wiki_query`
   - maintain with `wiki_lint`

## Validation

- Workspace discovery check:
  - `corepack pnpm -r list --depth -1 | rg skill-llm-memory`
- Lockfile reproducibility check:
  - `corepack pnpm install --frozen-lockfile`
  - verify no tracked diff remains

## Local-Only Constraint

- No cloud service is required by this package.
- Skill content is static markdown + templates.
- Runtime behavior depends on local tool/runtime configuration.
