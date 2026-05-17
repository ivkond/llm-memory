# ADR-0023: Filesystem write coordination

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `docs/roadmap/RM-0003-write-coordination.md`

## Context

Multiple mutating operations (`remember`, `import`, `ingest`, `lint`) can run concurrently across CLI and MCP processes. Git worktrees isolate branch content for some operations, but merge/state/index side effects still race without one application-level coordination mechanism.

## Decision

Use a local filesystem lock as the single write-coordination mechanism for a wiki root.

- Core defines an `IWriteCoordinator` port and mutating services run write critical sections through `runExclusive`.
- Infra provides `FsWriteCoordinator` that acquires a lock directory at `.<wiki>/.llm-memory/write.lock` using atomic `mkdir`.
- Lock acquisition uses bounded retries, timeout, and stale-lock recovery based on owner metadata heartbeat (with mtime only as fallback when metadata is unavailable).
- Coordination failures are surfaced as typed domain errors for CLI and MCP handlers.

## Consequences

- Positive: serializes writes across processes without hosted infrastructure.
- Positive: keeps product direction local-first, Git-backed, Markdown-based.
- Negative: long-running write operations can delay other mutating operations.
- Negative: stale-lock recovery can unblock writes only after configured stale threshold.

## Alternatives considered

- In-process mutex only: rejected because it does not coordinate across CLI/MCP processes.
- External lock service or hosted queue: rejected as out of local-first scope.
- Git-only optimistic retries: rejected because state/index side effects still need app-level serialization.

## Implementation notes

- `packages/core/src/ports/write-coordinator.ts`
- `packages/core/src/services/{remember-service,import-service,ingest-service,lint-service}.ts`
- `packages/infra/src/fs-write-coordinator.ts`
- `packages/common/src/build-container.ts`

## Open questions

None.
