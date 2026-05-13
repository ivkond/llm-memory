# ADR-0022: Page-level unresolved conflict detection for RM-0010

- Status: Accepted
- Date: 2026-05-13
- Supersedes: none
- Superseded by: none
- Source documents:
  - `docs/roadmap/RM-0010-contradiction-detection.md`
  - `docs/roadmap/RM-0009-memory-atoms-claims.md`
  - `docs/roadmap/RM-0026-health-diagnostics-reporting.md`

## Context

RM-0010 requires contradiction detection, unresolved-conflict reporting, and safeguards against silently smoothing conflicting knowledge. The project does not yet ship RM-0009 claim atoms, so claim-level contradiction semantics are not currently available. The first implementation must stay local-first, deterministic, and easy to verify.

## Decision

Implement RM-0010's first slice with a page-level unresolved-conflict convention:
- Health checks detect contradiction issues when a page contains a `## Unresolved conflicts` or `## Conflicts` section with one or more list items.
- Consolidation instructions must preserve incompatible claims under an unresolved-conflicts section instead of silently choosing one side.
- Health detection remains read-only and does not auto-resolve conflicts.
- Rich grouped diagnostics remain in RM-0026 scope.

## Consequences

- Positive: deterministic behavior, simple Markdown-native convention, and immediate contradiction visibility in existing lint issue output.
- Positive: no dependency on claim-atom rollout for first implementation.
- Negative: this only detects explicitly recorded conflicts, not hidden semantic contradictions.
- Negative: detailed machine-readable contradiction evidence is deferred until RM-0026 or later.

## Alternatives considered

- Block RM-0010 until RM-0009 claim atoms: rejected for first slice because it delays contradiction safeguards and expands scope.
- LLM-driven semantic contradiction detection in health: rejected for first slice because it is nondeterministic, expensive, and harder to test.

## Implementation notes

- `packages/core/src/services/lint/health-phase.ts`
- `packages/core/src/services/lint/consolidate-phase.ts`
- `packages/core/tests/services/lint/health-phase.test.ts`
- `packages/core/tests/services/lint/consolidate-phase.test.ts`
- `README.md`

## Open questions

None.
