# ADR-0002: Local Solo Workstation Scope

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/REQUIREMENTS.md`
  - `.planning/codebase/INTEGRATIONS.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

The primary consumer is a local AI agent workflow, especially Claude Code via MCP. The developer accesses the same memory through CLI and Obsidian. Team, hosted, and enterprise needs are not required for the Solo MVP.

## Decision

v1 targets one user on a local workstation: local Git repository, local files, local CLI, local MCP server, and local hooks. There is no hosted backend, multi-tenant authentication, ACL, or federation in v1.

## Consequences

- Auth, deployment, and observability remain simple.
- Provider API keys and runtime state stay on the user's machine.
- Cross-process coordination is limited; single-writer assumptions are acceptable.
- Team/enterprise expansion remains possible but belongs to the roadmap.

## Alternatives considered

- Hosted service from the start: rejected as too much operational complexity before validating solo value.
- Automatic Git sync/push: rejected because it increases data-loss and credential risk; users own remote sync.

## Implementation notes

MCP binds to loopback by default. The library performs local Git operations but does not push or pull.

## Open questions

None.
