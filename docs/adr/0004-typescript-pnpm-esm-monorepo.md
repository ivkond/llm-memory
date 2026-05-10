# ADR-0004: TypeScript pnpm ESM Monorepo

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/STACK.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

The project needs first-class MCP SDK support, TypeScript AI SDK compatibility, and a practical local developer workflow. Packages need clear layering and shared type checking.

## Decision

Use a TypeScript monorepo managed by pnpm workspaces. Packages are ESM-only, target Node 20+, and use TypeScript project references with NodeNext module resolution.

## Consequences

- MCP SDK, AI SDK, and markdown ecosystem integration are straightforward.
- Package boundaries can enforce architectural layering.
- Relative imports require explicit `.js` extensions in source.
- Native dependencies must support the target Node/platform matrix.

## Alternatives considered

- Rust: rejected for weaker MCP, markdown, and AI SDK ecosystem fit.
- Python: rejected because the runtime and package ecosystem target TypeScript agents and MCP SDK usage.
- Single package: rejected because it would blur core, infra, and transport boundaries.

## Implementation notes

Current package names use the `@ivkond-llm-wiki/*` scope. Older planning docs may use `@llm-wiki/*`.

## Open questions

None.
