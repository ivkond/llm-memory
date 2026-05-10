# Product Roadmap

v1 functional requirements are complete according to the reconciled planning state. Accepted architecture and product decisions are recorded in [`docs/adr`](adr/). This roadmap tracks planned product development, deferred scope, and follow-up work.

## v2 Requirements

### LLM memory hardening backlog

Detailed roadmap item records live in [`docs/roadmap`](roadmap/). These items capture product hardening for `llm-memory` as a local-first, Git-backed, self-maintaining LLM memory wiki. The focus is durable agent memory, not analyst-specific workflows.

| ID                                                              | Title                                       | Priority | Area         | Status   |
| --------------------------------------------------------------- | ------------------------------------------- | -------- | ------------ | -------- |
| [RM-0001](roadmap/RM-0001-operation-journal.md) | Durable operation journal | P0 | reliability | Proposed |
| [RM-0002](roadmap/RM-0002-recovery-diagnostics.md) | Recovery and diagnostics commands | P0 | operations | Proposed |
| [RM-0003](roadmap/RM-0003-write-coordination.md) | Application-level write coordination | P0 | reliability | Proposed |
| [RM-0004](roadmap/RM-0004-idempotency-keys.md) | Idempotency keys for write operations | P0 | reliability | Proposed |
| [RM-0005](roadmap/RM-0005-verbatim-metadata.md) | Enriched verbatim record metadata | P0 | memory-model | Proposed |
| [RM-0006](roadmap/RM-0006-processing-statuses.md) | Richer raw memory processing statuses | P0 | memory-model | Proposed |
| [RM-0007](roadmap/RM-0007-staleness-aware-retrieval.md) | Staleness-aware retrieval | P0 | retrieval | Proposed |
| [RM-0008](roadmap/RM-0008-retrieval-evaluation-suite.md) | Retrieval evaluation suite | P0 | retrieval | Proposed |
| [RM-0009](roadmap/RM-0009-memory-atoms-claims.md) | Memory atom and claim layer | P1 | memory-model | Proposed |
| [RM-0010](roadmap/RM-0010-contradiction-detection.md) | Contradiction detection | P1 | retrieval | Proposed |
| [RM-0011](roadmap/RM-0011-citation-faithfulness.md) | Citation faithfulness checks | P1 | retrieval | Proposed |
| [RM-0012](roadmap/RM-0012-canonical-page-templates.md) | Canonical Markdown page templates | P1 | memory-model | Proposed |
| [RM-0013](roadmap/RM-0013-consolidate-promote-pipeline.md) | Improved consolidate and promote pipeline | P1 | memory-model | Proposed |
| [RM-0014](roadmap/RM-0014-index-consistency-checks.md) | Search and index consistency checks | P1 | operations | Proposed |
| [RM-0015](roadmap/RM-0015-ingest-prompt-injection-hardening.md) | Ingest prompt-injection hardening | P1 | security | Proposed |
| [RM-0016](roadmap/RM-0016-expanded-wiki-status.md) | Expanded wiki status diagnostics | P2 | operations | Proposed |
| [RM-0017](roadmap/RM-0017-backup-snapshot-restore.md) | Backup, snapshot, and restore commands | P2 | operations | Proposed |
| [RM-0018](roadmap/RM-0018-observability.md) | Observability for memory operations | P2 | operations | Proposed |
| [RM-0019](roadmap/RM-0019-review-workflow.md) | Review workflow for proposed memory changes | P2 | UX | Proposed |
| [RM-0020](roadmap/RM-0020-memory-import-integrations.md) | Import integrations umbrella | P1 | integrations | Proposed |

### Multi-agent import

| ID                                                           | Title                                               | Priority | Area         | Status   |
| ------------------------------------------------------------ | --------------------------------------------------- | -------- | ------------ | -------- |
| [RM-0021](roadmap/RM-0021-native-agent-import-adapters.md) | Native memory import adapters for additional agents | P1 | integrations | Proposed |
| [RM-0022](roadmap/RM-0022-preserve-verbatim-import-model.md) | Preserve verbatim import model | P1 | memory-model | Proposed |
| [RM-0023](roadmap/RM-0023-per-agent-import-state.md) | Per-agent import state | P1 | operations | Proposed |

### LLM-enhanced health checks

RM-0024 is retained as a superseded traceability record; RM-0010 owns contradiction detection and RM-0026 owns reporting.

| ID                                                           | Title                                | Priority | Area        | Status   |
| ------------------------------------------------------------ | ------------------------------------ | -------- | ----------- | -------- |
| [RM-0024](roadmap/RM-0024-health-contradiction-detection.md) | Health check contradiction detection | P1 | maintenance | Superseded |
| [RM-0025](roadmap/RM-0025-health-missing-concept-pages.md) | Health check missing concept pages | P1 | maintenance | Proposed |
| [RM-0026](roadmap/RM-0026-health-diagnostics-reporting.md) | Health diagnostics reporting | P1 | maintenance | Proposed |

### Infrastructure and operations

| ID                                                             | Title                                | Priority | Area       | Status   |
| -------------------------------------------------------------- | ------------------------------------ | -------- | ---------- | -------- |
| [RM-0027](roadmap/RM-0027-npm-publishing-pipeline.md) | npm publishing pipeline | P1 | operations | Proposed |
| [RM-0028](roadmap/RM-0028-archive-retention-pruning.md) | Archive retention and pruning | P1 | operations | Proposed |
| [RM-0029](roadmap/RM-0029-recurring-lint-import-scheduling.md) | Recurring lint and import scheduling | P1 | operations | Proposed |

## Deferred / Non-goals

| ID                                                                   | Title                                    | Priority | Area  | Status   |
| -------------------------------------------------------------------- | ---------------------------------------- | -------- | ----- | -------- |
| [RM-0030](roadmap/RM-0030-defer-team-enterprise-features.md) | Defer team and enterprise features | P2 | scope | Deferred |
| [RM-0031](roadmap/RM-0031-defer-complex-scope-expressions.md) | Defer complex scope expressions | P2 | scope | Deferred |
| [RM-0032](roadmap/RM-0032-defer-offline-local-llm-mode.md) | Defer offline local-LLM degraded mode | P2 | scope | Deferred |
| [RM-0033](roadmap/RM-0033-defer-mcp-stdio-transport.md) | Defer MCP stdio transport | P2 | scope | Deferred |
| [RM-0034](roadmap/RM-0034-defer-deep-semantic-sensitivity.md) | Defer deep semantic sensitivity analysis | P2 | scope | Deferred |
| [RM-0035](roadmap/RM-0035-defer-per-project-sensitivity-policies.md) | Defer per-project sensitivity policies | P2 | scope | Deferred |
| [RM-0036](roadmap/RM-0036-defer-secret-manager-integrations.md) | Defer secret-manager integrations | P2 | scope | Deferred |

## Backlog Candidates

RM-0039 is retained as a superseded traceability record; RM-0030 owns the team/enterprise deferred scope boundary.

| ID                                                      | Title                         | Priority | Area         | Status   |
| ------------------------------------------------------- | ----------------------------- | -------- | ------------ | -------- |
| [RM-0037](roadmap/RM-0037-wiki-quality-metrics.md) | Wiki quality metrics | P2 | maintenance | Proposed |
| [RM-0038](roadmap/RM-0038-additional-import-sources.md) | Additional import sources | P2 | integrations | Proposed |
| [RM-0039](roadmap/RM-0039-team-enterprise-evolution.md) | Team and enterprise evolution | P2 | scope | Superseded |

## Quality / Tooling Follow-ups

Some items below came from the 2026-04-10 codebase/testing audit and should be re-validated before implementation.

### Static analysis, formatting, and gates

| ID                                                           | Title                           | Priority | Area    | Status   |
| ------------------------------------------------------------ | ------------------------------- | -------- | ------- | -------- |
| [RM-0040](roadmap/RM-0040-real-static-analysis-lint-gate.md) | Real static-analysis lint gate | P1 | quality | Proposed |
| [RM-0041](roadmap/RM-0041-formatting-checks.md) | Formatting checks | P1 | quality | Proposed |
| [RM-0042](roadmap/RM-0042-pre-commit-static-checks.md) | Pre-commit static checks | P2 | quality | Proposed |
| [RM-0043](roadmap/RM-0043-ci-quality-gates.md) | CI quality gates | P1 | quality | Proposed |
| [RM-0044](roadmap/RM-0044-coverage-tooling-thresholds.md) | Coverage tooling and thresholds | P2 | quality | Proposed |

### Test maintainability

| ID                                                      | Title                             | Priority | Area    | Status   |
| ------------------------------------------------------- | --------------------------------- | -------- | ------- | -------- |
| [RM-0045](roadmap/RM-0045-shared-test-fakes.md) | Shared test fakes and factories | P2 | quality | Proposed |
| [RM-0046](roadmap/RM-0046-parameterized-input-tests.md) | Parameterized input-variant tests | P2 | quality | Proposed |
| [RM-0047](roadmap/RM-0047-contract-test-helpers.md) | Reusable contract-test helpers | P2 | quality | Proposed |

### Reliability and correctness hardening

| ID                                                                | Title                                     | Priority | Area        | Status   |
| ----------------------------------------------------------------- | ----------------------------------------- | -------- | ----------- | -------- |
| [RM-0048](roadmap/RM-0048-ingest-source-reading-sandbox.md) | Ingest source reading sandbox | P1 | security | Proposed |
| [RM-0049](roadmap/RM-0049-schema-driven-llm-json-parsing.md) | Schema-driven LLM JSON parsing | P1 | reliability | Proposed |
| [RM-0050](roadmap/RM-0050-query-stale-index-performance.md) | Query-time stale-index performance | P1 | retrieval | Proposed |
| [RM-0051](roadmap/RM-0051-frontmatter-config-state-validation.md) | Frontmatter, config, and state validation | P1 | reliability | Proposed |
| [RM-0052](roadmap/RM-0052-embedding-batching-retry-review.md) | Embedding batching and retry review | P2 | reliability | Proposed |
| [RM-0053](roadmap/RM-0053-git-error-classification.md) | Git error classification | P2 | reliability | Proposed |

### Refactoring candidates

| ID                                                                 | Title                                       | Priority | Area        | Status   |
| ------------------------------------------------------------------ | ------------------------------------------- | -------- | ----------- | -------- |
| [RM-0054](roadmap/RM-0054-split-search-engine-responsibilities.md) | Split search engine responsibilities | P2 | refactoring | Proposed |
| [RM-0055](roadmap/RM-0055-split-ingest-orchestration.md) | Split ingest orchestration responsibilities | P2 | refactoring | Proposed |
| [RM-0056](roadmap/RM-0056-review-native-runtime-boundaries.md) | Review native/runtime dependency boundaries | P2 | refactoring | Proposed |

## Release / Process Caveats

RM-0060 is the release-checklist aggregator. RM-0058, RM-0059, and RM-0063 are retained as superseded traceability records; RM-0027 remains the npm publishing pipeline.

| ID                                                              | Title                                     | Priority | Area    | Status   |
| --------------------------------------------------------------- | ----------------------------------------- | -------- | ------- | -------- |
| [RM-0057](roadmap/RM-0057-release-caveats-nonblocking.md) | Keep release caveats non-blocking | P2 | release | Proposed |
| [RM-0058](roadmap/RM-0058-publishability-pr-traceability.md) | Publishability and PR traceability checks | P2 | release | Superseded |
| [RM-0059](roadmap/RM-0059-release-evidence-traceability.md) | Release evidence traceability | P2 | release | Superseded |
| [RM-0060](roadmap/RM-0060-full-release-quality-gates.md) | Full release quality gates | P2 | release | Proposed |
| [RM-0061](roadmap/RM-0061-release-artifact-verification.md) | Release artifact verification | P2 | release | Proposed |
| [RM-0062](roadmap/RM-0062-claude-code-artifact-verification.md) | Claude Code artifact verification | P2 | release | Proposed |
| [RM-0063](roadmap/RM-0063-deferred-scope-tracking.md) | Deferred scope tracking before release | P2 | release | Superseded |

## Sources

- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/codebase/CONCERNS.md`
- `.planning/codebase/TESTING.md`
- `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`
