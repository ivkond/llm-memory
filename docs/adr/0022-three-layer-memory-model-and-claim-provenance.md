# ADR-0022: Three-layer memory model and claim provenance

- Status: Proposed
- Date: 2026-05-13
- Source documents:
  - `docs/roadmap/RM-0009-memory-atoms-claims.md`
  - `docs/roadmap/RM-0010-contradiction-detection.md`
  - `docs/roadmap/RM-0007-staleness-aware-retrieval.md`
  - `docs/roadmap/RM-0013-consolidate-promote-pipeline.md`
  - `docs/roadmap/RM-0006-processing-statuses.md`

## Context

ADR-0003 defines a two-layer model: verbatim records and canonical pages. RM-0009 requires a durable intermediate claim layer to improve traceability, deduplication, and later contradiction handling while preserving ADR-0001 and ADR-0007 local Markdown/Git-first storage constraints.

This decision must set stable storage and identity rules before implementation work begins.

## Decision

Adopt a three-layer memory model:

1. Verbatim records in `log/{agent}/raw/*.md` remain the write hot path.
2. Durable claim records are added as a new intermediate layer.
3. Canonical wiki/project Markdown pages remain the curated output layer.

Claim storage and identity:

- Claims are stored as one file per claim at `claims/<claim-id>.md`.
- `claim-id` MUST be deterministic and stable for the same normalized claim payload.
- Each claim stores a `normalized_key` derived from normalized text plus stable context dimensions required for deduplication.
- Normalization rules MUST be deterministic and versioned so future changes can be rolled out without silently rekeying existing claims.

Canonical page provenance:

- Canonical pages keep `sources` for raw/page provenance paths.
- Canonical pages add a separate `claims` frontmatter list for claim references.
- `sources` MUST NOT be repurposed to carry claim IDs.

Lint phase order:

- Add a dedicated `claims` phase before `consolidate`.
- Effective phase sequence becomes `claims -> consolidate -> promote -> health`.

Architecture gate and scope boundaries:

- RM-0009 implementation is blocked until this ADR is accepted.
- Out of scope for this ADR and RM-0009 implementation task:
  - RM-0010 contradiction detection semantics and scoring.
  - RM-0007 retrieval ranking/filtering semantics.
  - RM-0013 promotion policy thresholds/rules.
  - RM-0006 replacement of raw processing status model.

## Consequences

- Traceability improves by linking canonical content to normalized claim IDs and to raw evidence separately.
- Claim extraction becomes an explicit lint responsibility and introduces a new durable file set under `claims/`.
- Existing tooling that assumes `consolidate` as first semantic phase must be updated.
- Deterministic identity/versioning rules are required to avoid claim churn over time.

## Alternatives considered

- Keep two-layer model and annotate pages directly from raw entries: rejected because deduplication and contradiction workflows remain implicit and hard to audit.
- Store claims in frontmatter blobs on canonical pages only: rejected because claims are not durable first-class records and cannot be independently linted/versioned.
- Put claim references into `sources`: rejected because it mixes raw/page provenance with normalized claim identity and weakens contract clarity.

## Implementation notes

- This ADR is the architecture gate for RM-0009 decomposition tasks.
- Follow-up implementation should be split into:
  - claim domain model + deterministic ID/normalization rules;
  - claim file store under `claims/`;
  - `wiki_lint` claims-phase extraction and integration before consolidate;
  - canonical page frontmatter updates (`claims` list while preserving `sources`);
  - status/CLI/MCP/docs/tests alignment.

## Open questions

- Exact hash algorithm and canonical serialization for `claim-id`/`normalized_key`.
- Versioning metadata location for normalization rule evolution.
