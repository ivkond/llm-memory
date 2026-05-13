# RM-0009: Memory atom and claim layer

- Status: Proposed
- Priority: P1
- Area: memory-model
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - [ADR-0001](../adr/0001-markdown-in-git-source-of-truth.md)
  - [ADR-0003](../adr/0003-verbatim-log-and-consolidation.md)
  - [ADR-0007](../adr/0007-local-file-persistence-rebuildable-search-cache.md)
  - [ADR-0022](../adr/0022-three-layer-memory-model-and-claim-provenance.md)
- Related items:
  - [RM-0010](RM-0010-contradiction-detection.md)
  - [RM-0007](RM-0007-staleness-aware-retrieval.md)
  - [RM-0013](RM-0013-consolidate-promote-pipeline.md)
  - [RM-0006](RM-0006-processing-statuses.md)

## Problem

Introduce a durable claim layer between verbatim records and canonical wiki pages to improve traceability and deduplication while preserving the existing local Markdown/Git source-of-truth model.

## Goal

Accept architecture and sequencing for a three-layer memory model:
verbatim records -> claims -> canonical pages.

## Non-goals

- Do not change unrelated roadmap scope.
- Do not introduce hosted or team-enterprise requirements unless a separate ADR or roadmap item accepts that scope.

## Scope (architecture gate)

- Define and accept the ADR for claim storage layout, identity stability, canonical provenance, and lint phase order.
- Decompose RM-0009 implementation into explicit follow-up tasks after ADR acceptance.
- Do not implement claim domain/store/lint integration work in this item.

## Acceptance criteria

- ADR-0022 defines claim storage path as `claims/<claim-id>.md`.
- ADR-0022 defines deterministic/stable claim ID and normalized-key expectations.
- ADR-0022 defines canonical-page provenance as separate `claims` list while preserving `sources` for raw/page paths.
- ADR-0022 defines lint phase naming/order with `claims` before `consolidate`.
- Implementation work is explicitly deferred until ADR-0022 is accepted.
- No production code changes are included in this roadmap-gate task.

## Design notes

This item is the required architecture gate from parent issue HAR-67. It preserves local-first, Git-backed, Markdown-based constraints and keeps contradiction detection, retrieval semantics, promotion policy, and processing-status redesign scoped to their dedicated roadmap items.

## Dependencies

- Parent planning artifacts on HAR-67 (Requirements Spec, Discovery Report, Technical Plan).
- ADR-0022 acceptance is required before implementation tasks begin.

## Implementation sequencing (post-ADR acceptance)

1. Claim domain and identity rules:
Define claim schema, deterministic `claim_id`, and normalized-key versioning rules.
2. Claim storage:
Add claim persistence at `claims/<claim-id>.md` with stable read/write contracts.
3. Lint integration:
Add `claims` lint phase before `consolidate`, then connect extracted claims to canonical update flow.
4. Surface updates:
Update status/CLI/MCP/docs for claim counts/provenance where needed.
5. Verification:
Add/extend tests for deterministic IDs, claim extraction idempotency, provenance links, and phase ordering.

## Risks and trade-offs

- If identity normalization is underspecified, claim churn and non-deterministic dedupe can occur.
- If boundaries with RM-0010/RM-0007/RM-0013/RM-0006 blur, scope creep can delay implementation.

## Open questions

None.
