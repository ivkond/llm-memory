# ADR-0018: Unified Commander CLI

- Status: Accepted
- Date: 2026-05-10
- Supersedes: Phase 4's initial Cliffy framework choice
- Source documents:
  - `.planning/phases/04-cli/04-CONTEXT.md`
  - `.planning/phases/04-cli/04-01-SUMMARY.md`
  - `.planning/phases/04-cli/04-02-SUMMARY.md`

## Context

Developers need terminal access to wiki operations without MCP. Phase 4 initially selected Cliffy, but implementation moved to Commander due to npm availability.

## Decision

Provide one `llm-wiki` binary implemented with Commander. Commands include `init`, `ingest`, `lint`, `import`, `search`, `status`, and the current `skill` manager. Commands are transport/UI wrappers and use `buildContainer` for service-backed operations.

## Consequences

- CLI users get one consistent entry point.
- Commander is the supported CLI framework.
- Business logic remains in core services and common wiring.
- CLI-specific validation/output helpers may be refactored without changing architecture.

## Alternatives considered

- Cliffy: superseded due to npm availability issues.
- Separate binaries per operation: rejected because one command hierarchy is simpler.
- CLI-specific service wiring: rejected to avoid drift from MCP behavior.

## Implementation notes

`packages/cli/src/index.ts` registers the command tree. `packages/cli/package.json` exposes the binary.

## Open questions

None.
