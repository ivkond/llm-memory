# ADR-0010: Layered Configuration

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/ARCHITECTURE.md`
  - `.planning/codebase/STACK.md`
  - `.planning/codebase/INTEGRATIONS.md`

## Context

The project needs reproducible shared settings, local secrets, environment overrides, and mutable runtime state. These concerns must not be mixed in one committed file.

## Decision

Configuration is loaded by merging defaults, `.config/settings.shared.yaml`, `.local/settings.local.yaml`, and environment variables. Runtime state is separate in `.local/state.yaml`. `.local/` is gitignored.

## Consequences

- Shared project settings can be committed.
- API keys and machine-specific paths remain local.
- Environment variables can override config in automation or hooks.
- Runtime state does not pollute shared configuration.

## Alternatives considered

- Single config file: rejected because it either leaks secrets or prevents shared reproducibility.
- Environment-only config: rejected because it is hard to audit and share.
- Database-backed config: rejected as unnecessary for local file-first scope.

## Implementation notes

`ConfigLoader` performs deep merging and handles `LLM_WIKI_*` overrides, including MCP host/port.

## Open questions

None.
