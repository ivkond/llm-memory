# ADR 0021: Verbatim Entry Metadata Schema And Identity

- Status: Accepted
- Date: 2026-05-10
- Deciders: LLM Memory maintainers
- Supersedes: None
- Superseded by: None

## Context

RM-0005 requires verbatim records to carry first-class metadata for identity, provenance, and processing lifecycle. Existing records only contain session/agent metadata and a `created` timestamp, which is insufficient for stable API-level identity and downstream traceability.

## Decision

Verbatim records under `log/<agent>/raw/*.md` use Markdown frontmatter with these metadata fields:

- `entry_id`: stable logical record identity.
- `source`: object with `type` and optional `uri`/`digest`.
- `model`: optional object with provider/model/call IDs when available.
- `operation_id`: optional operation correlation ID.
- `processing`: object with required `created_at` and optional lifecycle timestamps.
- `consolidated`: existing boolean flag remains authoritative for lint phase progression.

Backward compatibility rules:

- Legacy records without `entry_id` synthesize it from filename.
- Legacy records without `processing.created_at` map from `created`.
- Unknown frontmatter keys remain tolerated.

## Consequences

Positive:

- Stable entry identity is decoupled from filesystem path conventions.
- Import/manual/session ingestion can attach provenance and lifecycle metadata consistently.
- Consolidation can consume richer context without changing Markdown storage format.

Trade-offs:

- Frontmatter is more verbose.
- Callers may not always have model/operation metadata, so these remain optional.

## Alternatives considered

- Keep only filename-based identity: rejected because it conflates path identity with API identity.
- External metadata store: rejected because it conflicts with local-first Markdown-in-Git direction.
