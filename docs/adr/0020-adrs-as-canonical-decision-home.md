# ADR-0020: ADRs as Canonical Decision Home

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/REQUIREMENTS.md`
  - `.planning/ROADMAP.md`
  - `.planning/STATE.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`
  - `docs/superpowers/plans/*`

## Context

Historical planning documents contain a mix of requirements, implementation plans, summaries, research, risks, accepted decisions, and future product ideas. This makes it hard to distinguish durable architecture from execution history and roadmap items.

## Decision

Use `docs/adr/` as the canonical home for durable architecture decisions. Use `docs/ROADMAP.md` for planned product development, deferred work, and follow-up improvements. Keep `.planning/` and `docs/superpowers/` as historical source documents unless a later cleanup explicitly archives them.

## Consequences

- Future decisions have a predictable format and location.
- Roadmap items no longer pollute ADRs as pseudo-decisions.
- Historical documents remain useful as source evidence.
- New work should update ADRs only when it changes an accepted decision.

## Alternatives considered

- Keep adding decisions to `.planning/PROJECT.md`: rejected because it mixes status, requirements, and decisions.
- Convert every planning file into an ADR: rejected because plans and summaries are not durable decisions.
- Delete old planning docs immediately: rejected because ADRs still need source traceability.

## Implementation notes

`docs/adr/README.md` indexes current ADRs. `docs/adr/template.md` defines the standard format.

## Open questions

None.
