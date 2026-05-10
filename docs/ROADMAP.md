# Product Roadmap

v1 functional requirements are complete according to the reconciled planning state. Accepted architecture and product decisions are recorded in [`docs/adr`](adr/). This roadmap tracks planned product development, deferred scope, and follow-up work.

## v2 Requirements

### Multi-agent import

- Add native memory import adapters for additional AI agents:
  - Cursor
  - Codex
  - KiloCode
  - OpenCode
- Preserve the current import model: external agent memories become verbatim entries under `log/{agent}/raw/`, then flow through lint/consolidation.
- Track per-agent import state in local runtime state, not in git-tracked agent config.

### LLM-enhanced health checks

- Detect contradictions between wiki pages.
- Identify mentioned concepts that do not yet have their own page.
- Report health issues through `wiki_lint` or status-style diagnostics without silently modifying unrelated content.

### Infrastructure and operations

- Add an npm publishing pipeline with CI/CD.
- Define archive retention and pruning behavior for old archives.
- Add scheduling support for recurring lint/import runs, such as cron or interval-based local execution.

## Deferred / Non-goals

- Team/enterprise features: shared repos, ACLs, federation, central search, compliance workflows.
- Complex scope expressions such as `wiki/a+projects/b`, glob-style inclusion/exclusion, or `*+!log` query syntax.
- Offline/local-LLM degraded mode via `node-llama.cpp` or similar.
- MCP stdio transport while HTTP remains the selected primary transport for this release line.
- Deep semantic sensitivity analysis beyond pattern-based sanitization.
- Per-project sensitivity policies.
- Secret-manager integrations such as Vault or 1Password.

## Backlog Candidates

- Wiki quality metrics based on recall/query frequency.
- Additional import sources beyond the v2 adapter set, such as Qwen, Antigravity, Kiro, and Amp.
- Team/enterprise evolution if solo local usage no longer remains the primary deployment model.

## Quality / Tooling Follow-ups

Some items below came from the 2026-04-10 codebase/testing audit and should be re-validated before implementation.

### Static analysis, formatting, and gates

- Ensure linting is a real static-analysis gate, not only TypeScript compilation.
- Ensure formatting is configured and checkable in CI/local workflows.
- Add or verify pre-commit hooks that run the project static checks.
- Add or verify CI gates for typecheck, lint, build, and tests.
- Add coverage tooling and thresholds aligned with the testing policy.

### Test maintainability

- Extract duplicated in-memory test fakes into shared test helpers/factories.
- Convert repeated input-variant tests to `it.each` where cases differ only by data.
- Consider reusable contract-test helpers for ports if additional adapter implementations are added.

### Reliability and correctness hardening

- Harden `wiki_ingest` source reading so untrusted callers cannot read arbitrary local files outside approved roots.
- Make LLM JSON response parsing schema-driven and distinguish malformed model output from provider unavailability.
- Improve query-time stale-index detection to avoid sequential per-file checks on every query for large wikis.
- Validate file-loaded frontmatter/config/state data at adapter boundaries instead of relying on unchecked casts.
- Review batching/retry behavior for embedding calls before heavy rebuild/import workloads.
- Review git error classification so conflict handling does not depend on localized human-readable messages.

### Refactoring candidates

- Split oversized/hot classes or services where responsibilities are mixed, especially search engine persistence/indexing/fusion/excerpt concerns.
- Split ingest orchestration from path validation, LLM extraction, and frontmatter rendering if it continues to grow.
- Review native/runtime dependencies in core/application code and move infrastructure-specific concerns behind ports where appropriate.

## Release / Process Caveats

- v1 requirements are reconciled as complete; remaining caveats are process/release follow-ups, not functional blockers.
- Some child issues previously flagged publishability or PR traceability risk even when functional validation passed; keep these separate from requirement-completion status.
- Before publishing a release, verify evidence links, branch/PR history, and gate outputs are traceable from the release notes.
- Re-run the full quality gate set before release: install/build/typecheck, lint/format checks, unit/adapter/integration tests, and coverage if configured.
- Confirm release artifacts and package names match current workspace package names before npm publication.
- Confirm Claude Code hook and skill artifacts are intentionally present or intentionally removed before release.
- Confirm deferred items above are either tracked as issues or explicitly marked out of scope for the release.

## Sources

- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/codebase/CONCERNS.md`
- `.planning/codebase/TESTING.md`
- `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`
