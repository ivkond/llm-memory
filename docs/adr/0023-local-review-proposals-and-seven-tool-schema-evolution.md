# ADR-0023: Local review proposals and seven-tool schema evolution

- Status: Accepted
- Date: 2026-05-14
- Source documents:
  - `docs/roadmap/RM-0019-review-workflow.md`
  - `docs/adr/0015-seven-mcp-tools.md`
  - `Multica issue HAR-243`

## Context

RM-0019 adds a user review step before mutating durable memory outputs (consolidated entries and wiki pages). The workflow must remain local-first, Git-backed, and deterministic, while preserving ADR-0015's seven-tool MCP contract.

Follow-on implementation PRs need a precise contract for proposal storage, proposal lifecycle, CLI and MCP surfaces, conflict handling, and cleanup timing.

## Decision

### Proposal persistence and locality

- Each review proposal uses a stable proposal id and local manifest at `.local/reviews/<proposal-id>/manifest.json`.
- Proposal ids must be lowercase ASCII slug-like identifiers (`[a-z0-9][a-z0-9-]{2,62}`) and must not contain `/`, `..`, path separators, or whitespace.
- Runtime code must resolve proposal paths under `.local/reviews/` and reject traversal or absolute path inputs.
- Proposal artifacts are local-only runtime state and must never require hosted or team services.

### Manifest and lifecycle state model

A proposal manifest tracks metadata, candidate diffs, and state transitions.

Required lifecycle states:

- `pending`: proposal exists and can be shown, listed, and manually edited.
- `accepted`: acceptance completed successfully; promoted mutations are durable.
- `rejected`: proposal explicitly declined by user.
- `conflicted`: accept attempt hit merge/apply conflicts and requires recovery.
- `disabled`: proposal execution is blocked due to detected invariant break or unsupported environment state.

Recovery behavior:

- `conflicted` proposals remain recoverable. Users may inspect details, manually edit proposal artifacts, then retry accept or reject.
- `disabled` proposals remain visible with reason metadata and can transition back to `pending` only after explicit recovery action verifies invariants.

### Review workflow contract

- `create`: generate proposal artifacts and manifest in `pending` state using a preserved Git worktree.
- `show/list`: return manifest-backed summaries/details without mutating content.
- `manual edit`: editing files under proposal directory is supported while state is `pending` or `conflicted`; system must re-validate manifest before accept.
- `accept`: apply proposal changes from preserved worktree to target repository atomically; on success mark `accepted`.
- `reject`: mark `rejected` and leave artifacts available until archival.
- `conflict recovery`: when apply/merge fails, mark `conflicted`, persist conflict diagnostics, and keep worktree for retry.
- `rollback`: if accept partially applies and then fails, rollback must restore pre-accept state and leave proposal in `conflicted` or `disabled` with explicit diagnostics.

### Consolidation/archive safety rule

Raw verbatim entries referenced by a proposal must not be marked `consolidated` and must not be archived before accept succeeds.

- Proposal creation may annotate intent metadata only.
- The state transition that marks entries `consolidated` (and any archival scheduling) happens only after successful accept.
- Reject/conflict/disabled outcomes leave source entries unconsolidated and unarchived.

### Archival timing and worktree cleanup

- Accepted and rejected proposals may be archived after a retention window; conflicted and disabled proposals are never auto-pruned before recovery or explicit user discard.
- Worktree cleanup occurs only after terminal handling:
  - `accepted`/`rejected`: cleanup eligible after archival snapshot/write completes.
  - `conflicted`/`disabled`: keep worktree for recovery; cleanup only on explicit discard or successful recovery terminalization.

### MCP and CLI contract shape

RM-0019 does not add an eighth MCP tool.

- Extend `wiki_lint` and `wiki_status` schemas with explicit, versioned `action` or `mode` fields to represent review-proposal operations and views.
- Additive schema evolution must preserve backward compatibility for existing clients that omit new fields.
- New review operations map to existing transport tools:
  - proposal create/accept/reject actions under `wiki_lint`.
  - proposal list/show and recovery diagnostics under `wiki_status`.
- CLI commands must reflect the same action vocabulary and state names used by MCP responses.

### Status/reporting contract

Status outputs (CLI and MCP envelope data) must include enough detail for deterministic automation:

- proposal id and current state
- source worktree path (local relative path)
- conflict/disabled diagnostics when present
- acceptance/rejection timestamps
- archival eligibility and cleanup eligibility flags

## Consequences

- RM-0019 implementation can proceed across core, CLI, and MCP with a shared lifecycle contract.
- The seven-tool MCP surface remains stable while still supporting new behavior.
- Recovery flows become explicit and auditable, but add manifest/state validation complexity.

## Alternatives considered

- Add a dedicated `wiki_review` MCP tool: rejected for now to preserve ADR-0015's seven-tool contract.
- Store proposals outside repo runtime paths: rejected because it weakens local portability/debuggability.
- Auto-mark raw entries consolidated on proposal creation: rejected due to data-loss and auditability risk if accept fails.

## Implementation notes

- Proposal runtime artifacts live under `.local/reviews/`.
- Follow-on implementations should version proposal manifest schema explicitly.
- `packages/mcp-server/src/tools/wiki-lint.ts` and `packages/mcp-server/src/tools/wiki-status.ts` own the MCP action/mode schema evolution.

## Open questions

- Exact retention duration defaults and configurable policy knobs are deferred to implementation PRs.
