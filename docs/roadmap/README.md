# Roadmap Item Records

This directory tracks planned product work as ADR-style roadmap item records.

Roadmap item records describe work to be designed and implemented. ADRs in `../adr/` describe durable architecture or product decisions. A roadmap item may reference existing ADRs, and implementation of a roadmap item may produce a new ADR when a durable decision is made.

## Rules

- Keep `../ROADMAP.md` concise; use it as an index and release-level summary.
- Use one roadmap item record per independently actionable work item.
- Prefer stable IDs in the form `RM-NNNN-title.md`.
- Keep each item focused on problem, goal, scope, acceptance criteria, dependencies, risks, and open questions.
- Do not record accepted architecture decisions here; create or update an ADR instead.

## Index

| ID | Title | Priority | Area | Status |
| -- | ----- | -------- | ---- | ------ |
| [RM-0001](RM-0001-operation-journal.md) | Durable operation journal | P0 | reliability | Proposed |
| [RM-0002](RM-0002-recovery-diagnostics.md) | Recovery and diagnostics commands | P0 | operations | Proposed |
| [RM-0003](RM-0003-write-coordination.md) | Application-level write coordination | P0 | reliability | Proposed |
| [RM-0004](RM-0004-idempotency-keys.md) | Idempotency keys for write operations | P0 | reliability | Proposed |
| [RM-0005](RM-0005-verbatim-metadata.md) | Enriched verbatim record metadata | P0 | memory-model | Proposed |
| [RM-0006](RM-0006-processing-statuses.md) | Richer raw memory processing statuses | P0 | memory-model | Proposed |
| [RM-0007](RM-0007-staleness-aware-retrieval.md) | Staleness-aware retrieval | P0 | retrieval | Proposed |
| [RM-0008](RM-0008-retrieval-evaluation-suite.md) | Retrieval evaluation suite | P0 | retrieval | Proposed |
| [RM-0009](RM-0009-memory-atoms-claims.md) | Memory atom and claim layer | P1 | memory-model | Proposed |
| [RM-0010](RM-0010-contradiction-detection.md) | Contradiction detection | P1 | retrieval | Proposed |
| [RM-0011](RM-0011-citation-faithfulness.md) | Citation faithfulness checks | P1 | retrieval | Proposed |
| [RM-0012](RM-0012-canonical-page-templates.md) | Canonical Markdown page templates | P1 | memory-model | Proposed |
| [RM-0013](RM-0013-consolidate-promote-pipeline.md) | Improved consolidate and promote pipeline | P1 | memory-model | Proposed |
| [RM-0014](RM-0014-index-consistency-checks.md) | Search and index consistency checks | P1 | operations | Proposed |
| [RM-0015](RM-0015-ingest-prompt-injection-hardening.md) | Ingest prompt-injection hardening | P1 | security | Proposed |
| [RM-0016](RM-0016-expanded-wiki-status.md) | Expanded wiki status diagnostics | P2 | operations | Proposed |
| [RM-0017](RM-0017-backup-snapshot-restore.md) | Backup, snapshot, and restore commands | P2 | operations | Proposed |
| [RM-0018](RM-0018-observability.md) | Observability for memory operations | P2 | operations | Proposed |
| [RM-0019](RM-0019-review-workflow.md) | Review workflow for proposed memory changes | P2 | UX | Proposed |
| [RM-0020](RM-0020-memory-import-integrations.md) | Import integrations umbrella | P1 | integrations | Proposed |
| [RM-0021](RM-0021-native-agent-import-adapters.md) | Native memory import adapters for additional agents | P1 | integrations | Proposed |
| [RM-0022](RM-0022-preserve-verbatim-import-model.md) | Preserve verbatim import model | P1 | memory-model | Proposed |
| [RM-0023](RM-0023-per-agent-import-state.md) | Per-agent import state | P1 | operations | Proposed |
| [RM-0024](RM-0024-health-contradiction-detection.md) | Health check contradiction detection | P1 | maintenance | Superseded |
| [RM-0025](RM-0025-health-missing-concept-pages.md) | Health check missing concept pages | P1 | maintenance | Proposed |
| [RM-0026](RM-0026-health-diagnostics-reporting.md) | Health diagnostics reporting | P1 | maintenance | Proposed |
| [RM-0027](RM-0027-npm-publishing-pipeline.md) | npm publishing pipeline | P1 | operations | Proposed |
| [RM-0028](RM-0028-archive-retention-pruning.md) | Archive retention and pruning | P1 | operations | Proposed |
| [RM-0029](RM-0029-recurring-lint-import-scheduling.md) | Recurring lint and import scheduling | P1 | operations | Proposed |
| [RM-0030](RM-0030-defer-team-enterprise-features.md) | Defer team and enterprise features | P2 | scope | Deferred |
| [RM-0031](RM-0031-defer-complex-scope-expressions.md) | Defer complex scope expressions | P2 | scope | Deferred |
| [RM-0032](RM-0032-defer-offline-local-llm-mode.md) | Defer offline local-LLM degraded mode | P2 | scope | Deferred |
| [RM-0033](RM-0033-defer-mcp-stdio-transport.md) | Defer MCP stdio transport | P2 | scope | Deferred |
| [RM-0034](RM-0034-defer-deep-semantic-sensitivity.md) | Defer deep semantic sensitivity analysis | P2 | scope | Deferred |
| [RM-0035](RM-0035-defer-per-project-sensitivity-policies.md) | Defer per-project sensitivity policies | P2 | scope | Deferred |
| [RM-0036](RM-0036-defer-secret-manager-integrations.md) | Defer secret-manager integrations | P2 | scope | Deferred |
| [RM-0037](RM-0037-wiki-quality-metrics.md) | Wiki quality metrics | P2 | maintenance | Proposed |
| [RM-0038](RM-0038-additional-import-sources.md) | Additional import sources | P2 | integrations | Proposed |
| [RM-0039](RM-0039-team-enterprise-evolution.md) | Team and enterprise evolution | P2 | scope | Superseded |
| [RM-0040](RM-0040-real-static-analysis-lint-gate.md) | Real static-analysis lint gate | P1 | quality | Proposed |
| [RM-0041](RM-0041-formatting-checks.md) | Formatting checks | P1 | quality | Proposed |
| [RM-0042](RM-0042-pre-commit-static-checks.md) | Pre-commit static checks | P2 | quality | Proposed |
| [RM-0043](RM-0043-ci-quality-gates.md) | CI quality gates | P1 | quality | Proposed |
| [RM-0044](RM-0044-coverage-tooling-thresholds.md) | Coverage tooling and thresholds | P2 | quality | Proposed |
| [RM-0045](RM-0045-shared-test-fakes.md) | Shared test fakes and factories | P2 | quality | Proposed |
| [RM-0046](RM-0046-parameterized-input-tests.md) | Parameterized input-variant tests | P2 | quality | Proposed |
| [RM-0047](RM-0047-contract-test-helpers.md) | Reusable contract-test helpers | P2 | quality | Proposed |
| [RM-0048](RM-0048-ingest-source-reading-sandbox.md) | Ingest source reading sandbox | P1 | security | Proposed |
| [RM-0049](RM-0049-schema-driven-llm-json-parsing.md) | Schema-driven LLM JSON parsing | P1 | reliability | Proposed |
| [RM-0050](RM-0050-query-stale-index-performance.md) | Query-time stale-index performance | P1 | retrieval | Proposed |
| [RM-0051](RM-0051-frontmatter-config-state-validation.md) | Frontmatter, config, and state validation | P1 | reliability | Proposed |
| [RM-0052](RM-0052-embedding-batching-retry-review.md) | Embedding batching and retry review | P2 | reliability | Proposed |
| [RM-0053](RM-0053-git-error-classification.md) | Git error classification | P2 | reliability | Proposed |
| [RM-0054](RM-0054-split-search-engine-responsibilities.md) | Split search engine responsibilities | P2 | refactoring | Proposed |
| [RM-0055](RM-0055-split-ingest-orchestration.md) | Split ingest orchestration responsibilities | P2 | refactoring | Proposed |
| [RM-0056](RM-0056-review-native-runtime-boundaries.md) | Review native/runtime dependency boundaries | P2 | refactoring | Proposed |
| [RM-0057](RM-0057-release-caveats-nonblocking.md) | Keep release caveats non-blocking | P2 | release | Proposed |
| [RM-0058](RM-0058-publishability-pr-traceability.md) | Publishability and PR traceability checks | P2 | release | Superseded |
| [RM-0059](RM-0059-release-evidence-traceability.md) | Release evidence traceability | P2 | release | Superseded |
| [RM-0060](RM-0060-full-release-quality-gates.md) | Full release quality gates | P2 | release | Proposed |
| [RM-0061](RM-0061-release-artifact-verification.md) | Release artifact verification | P2 | release | Proposed |
| [RM-0062](RM-0062-claude-code-artifact-verification.md) | Claude Code artifact verification | P2 | release | Proposed |
| [RM-0063](RM-0063-deferred-scope-tracking.md) | Deferred scope tracking before release | P2 | release | Superseded |
