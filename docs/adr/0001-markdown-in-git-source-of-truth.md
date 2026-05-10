# ADR-0001: Markdown in Git as Source of Truth

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/INTEGRATIONS.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

LLM Wiki needs durable agent memory that remains readable and editable by humans, works with Obsidian and CLI workflows, and has an audit trail. Search indexes and runtime state are operational data, not canonical knowledge.

## Decision

Canonical knowledge is stored as Markdown files with YAML frontmatter in a Git repository rooted at the wiki directory. Git provides versioning, auditability, rollback, and merge semantics. Links use standard Markdown links for portability.

## Consequences

- Knowledge is accessible without the application through editors, Git, Obsidian, and command-line tools.
- Search databases are derived caches and can be rebuilt from Markdown.
- The project must preserve frontmatter schemas, link conventions, and index freshness.
- Git conflicts are part of the consistency model.

## Alternatives considered

- Relational database: stronger query model, weaker human readability and Git-native audit.
- Vector database as source of truth: good retrieval, poor transparency and durability semantics.
- Unstructured Obsidian vault: human-friendly but too weak for agent invariants.

## Implementation notes

Wiki content lives under `wiki/`, `projects/`, and `log/` in the wiki root. Derived local state lives under `.local/`.

## Open questions

None.
