# ADR-0008: Git Worktrees for Mutating Operations

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/ARCHITECTURE.md`
  - `.planning/codebase/INTEGRATIONS.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

Ingest and lint are long-running, LLM-backed operations that can touch multiple files. Failures must not partially mutate the main wiki branch. Merge conflicts should preserve recoverable generated work.

## Decision

Run ingest and lint in disposable Git worktrees under `.worktrees/{op}-{timestamp}`. On success, squash/commit in the worktree, fast-forward merge to main, reindex merged files, and remove the worktree. On processing failure, discard the worktree. On conflict, preserve it and return a conflict error with its path.

## Consequences

- Main remains untouched until successful merge.
- Failed LLM output does not leak into canonical files.
- Conflicts are recoverable by inspecting the preserved worktree.
- The wiki root must be a usable Git repository.

## Alternatives considered

- Direct writes plus rollback: rejected as fragile and unsafe.
- Temporary directory copy: rejected because it loses native Git merge/conflict behavior.
- Checkout branches in the main working tree: rejected because it disrupts the user's workspace.

## Implementation notes

`GitVersionControl` implements worktree operations. `IngestService` and lint flows use this isolation model.

## Open questions

None.
