# ADR 0021: Idempotency Keys For Write Operations

- Status: Accepted
- Date: 2026-05-10
- Owners: LLM Memory maintainers
- Related roadmap item: `docs/roadmap/RM-0004-idempotency-keys.md`

## Context

Write operations (`remember`, `import`, `ingest`, and `lint`) can be retried by clients after network or transport errors.
Without explicit idempotency tracking, retries may create duplicate memory entries, repeat git mutations, or append duplicate archive data.

## Decision

Introduce a first-class idempotency key model for write operations:

- Each write request may include an optional `idempotencyKey`.
- Keys are scoped by operation (`remember_fact`, `remember_session`, `import`, `ingest`, `lint`).
- For keyed requests, core computes a deterministic request fingerprint from normalized request data.
- If a key already exists for the same operation:
  - same fingerprint: return stored response and mark replay;
  - different fingerprint: return `IDEMPOTENCY_CONFLICT`.
- Records are stored locally in `.local/idempotency.yaml` through an infra adapter (`YamlIdempotencyStore`).

## Consequences

- Retry safety improves for all scoped write surfaces.
- Implementation remains local-first, Git-backed, and Markdown-based; idempotency state is an operational artifact under `.local/`.
- Future operation-journal work can consolidate with this metadata without changing external behavior.
