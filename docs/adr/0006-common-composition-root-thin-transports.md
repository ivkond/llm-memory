# ADR-0006: Common Composition Root and Thin Transports

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/phases/01-composition-root-and-mcp-bootstrap/01-CONTEXT.md`
  - `.planning/phases/01-composition-root-and-mcp-bootstrap/01-01-SUMMARY.md`
  - `.planning/REQUIREMENTS.md`

## Context

MCP and CLI need the same service graph. Duplicating adapter and service wiring in each transport would create drift and move business concerns outward.

## Decision

Use `@ivkond-llm-wiki/common` as the composition root. `buildContainer(config)` instantiates infrastructure adapters, injects them into core services, and returns a frozen `AppServices` object. CLI and MCP depend on this common package and remain thin wrappers.

## Consequences

- Service wiring changes happen in one place.
- Transports can be tested with fake `AppServices`.
- Business logic belongs in core services, not command or tool handlers.
- Startup code may load config, but handlers should not construct adapters.

## Alternatives considered

- Wire services separately in each transport: rejected due to duplication and behavior drift.
- Put wiring in infra: rejected because infra should remain adapter implementations, not application assembly.

## Implementation notes

`packages/common/src/app-services.ts` defines the service container. `packages/common/src/build-container.ts` builds it.

## Open questions

None.
