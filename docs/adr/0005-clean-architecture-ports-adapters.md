# ADR-0005: Clean Architecture with Ports and Adapters

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/codebase/ARCHITECTURE.md`
  - `.planning/codebase/CONVENTIONS.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

LLM Wiki has domain rules, external storage, Git operations, LLM calls, embeddings, source reading, and transports. Business rules must remain testable without concrete infrastructure.

## Decision

Use Clean/Hexagonal Architecture. `@ivkond-llm-wiki/core` contains domain entities, port interfaces, and services. `@ivkond-llm-wiki/infra` implements ports. Services depend on ports and domain types only. Dependencies point inward.

## Consequences

- Core services are unit-testable with fakes.
- Adapters can be swapped without changing business logic.
- Transport packages must not import deep infrastructure concerns except through approved wiring.
- New capabilities require explicit ports when they cross external boundaries.

## Alternatives considered

- Infrastructure-first services: rejected because business logic would couple to Node, Git, and LLM details.
- DI container framework: rejected as unnecessary; constructor injection is sufficient.

## Implementation notes

Ports live under `packages/core/src/ports/`, services under `packages/core/src/services/`, adapters under `packages/infra/src/`.

## Open questions

None.
