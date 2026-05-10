# Project Instructions for AI Agents

This file is the canonical instruction file for AI coding agents working on this repository. It replaces the previous `CLAUDE.md` and `RULES.md` files.

## Response and Process Rules

- Use concise, evidence-backed summaries: goal → action → result.
- If direction is unclear, stop and ask with a short 3-5 line plan.
- Do not perform destructive actions unless the user explicitly asks for them.
- Do not introduce placeholder code or docs: no `TODO`, `FIXME`, `...`, pseudocode, or incomplete stubs.
- Do not add new libraries/frameworks without an explicit need and approval.
- Significant architecture decisions belong in `docs/adr/`.
- Planned product work and follow-ups belong in `docs/ROADMAP.md`.

## Project Overview

**LLM Memory** is a personal knowledge base for AI agents implementing Andrej Karpathy's LLM Wiki pattern.

- Markdown files in Git are the single source of truth.
- LLMs handle structuring, cross-referencing, promotion, and deduplication.
- Primary consumer: Claude Code via MCP.
- Developer access: CLI and Obsidian-friendly Markdown.
- Core value: every useful fact an AI agent learns persists, consolidates, and becomes retrievable across sessions.

Current durable decisions are recorded in `docs/adr/`. Future development and deferred items are recorded in `docs/ROADMAP.md`.

## Current Sources of Truth

- Durable architecture/product decisions: `docs/adr/`.
- Planned product development and deferred work: `docs/ROADMAP.md`.
- Package behavior: source code and tests in `packages/*`.
- Public package APIs: package barrel files and exported types.
- If documentation and implementation disagree, verify against source/tests and update the stale document as part of the change.

## Architectural Constraints

- Tech stack: TypeScript, pnpm monorepo, ESM-only, Node 20+.
- Architecture: Clean/Hexagonal Architecture with ports and adapters.
- Dependency direction: infrastructure/adapters depend inward on core; core must not depend on infrastructure or transports.
- Transport packages are thin wrappers over core services through `@ivkond-llm-wiki/common`.
- MCP SDK: `@modelcontextprotocol/sdk` reference implementation.
- Target: local solo workstation; no hosted server deployment in v1.

## Build and Test Commands

```bash
pnpm i
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
```

Use focused package/test commands while iterating, then run the relevant broader gates before completion.

## Verification Before Completion

- Do not claim work is complete, fixed, or passing until verification has been run and the result is known.
- For docs-only changes, run formatting or documentation-focused checks that apply to the changed files.
- For code changes, run focused tests first, then broader typecheck/lint/build/test gates as appropriate for the risk.
- Report the exact commands run and whether they passed or failed.
- If a required check cannot be run, state why and what risk remains.

## Sensitive Data and Infrastructure Safety

Agents may edit infrastructure and automation files when the requested task requires it, including CI/CD workflows, Docker files, deployment scripts, and package/release configuration.

However, agents must not read, print, copy, modify, create, commit, or delete secrets or secret-bearing files.

Sensitive files and values include:

- `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`
- private keys, API keys, access tokens, refresh tokens, passwords, and connection strings with credentials
- cloud credentials and local credential stores, such as AWS/GCP/Azure credentials
- SSH keys and agent sockets
- production credentials embedded in config, CI variables, logs, or shell history

Rules:

- If a task requires a secret value, ask the user to provide it through their normal secure channel; do not request that it be pasted into the chat.
- Use placeholders such as `<API_KEY>` or documented environment variable names in examples.
- Do not expose secret values in logs, test output, diffs, commit messages, or summaries.
- It is allowed to edit templates and examples such as `.env.example`, `.env.template`, or documented variable names, as long as they contain placeholders only.
- It is allowed to edit CI/CD and deployment configuration, but never hard-code secrets into those files.
- If a secret is discovered accidentally, stop, do not repeat it, and tell the user which file/location appears to contain sensitive data without quoting the value.

## Package Layout

- `packages/core`: domain, ports, and application services.
- `packages/infra`: concrete adapters for filesystem, Git, LLM, embeddings, search, config, state, and source reading.
- `packages/common`: composition root and `AppServices` wiring.
- `packages/mcp-server`: MCP Streamable HTTP transport.
- `packages/cli`: `llm-wiki` command-line interface.

Public package APIs are exposed through package barrel files. Avoid deep imports across package boundaries.

## Architecture Rules

### Clean Architecture

- Domain: pure business concepts and typed errors. No Node APIs, infrastructure, or transport dependencies.
- Ports: interfaces for external capabilities; depend on domain types only.
- Services: orchestrate use cases through ports; do not instantiate adapters.
- Infrastructure: implements ports using concrete libraries and Node APIs.
- Transports: map CLI/MCP requests to `AppServices`; no business logic.

### SOLID / DRY / KISS / YAGNI

- SRP: one module/class should have one reason to change. Files over ~300 lines are candidates for splitting.
- OCP: prefer adding new strategies/classes over growing conditionals in old code.
- ISP: keep interfaces small; split fat ports.
- DIP: services depend on abstractions; factories create concrete adapters.
- DRY: extract duplication when it is real, repeated, and shares a reason to change.
- KISS: prefer the simplest correct solution.
- YAGNI: do not add abstractions or configuration for hypothetical future requirements.

## File Naming Conventions

- Domain files: `packages/core/src/domain/*.ts`, kebab-case.
- Ports: `packages/core/src/ports/*.ts`, one port per file where practical.
- Services: `packages/core/src/services/*-service.ts`.
- Infra adapters: `packages/infra/src/<backing-tech>-<port>.ts`.
- Tests: co-name with the unit or adapter under test.

## Error Handling

- Use typed domain errors rooted in `WikiError` with stable machine-readable `code` values.
- Validate service inputs before side effects.
- Wrap provider/adapter failures at boundaries; do not leak raw third-party errors through core services.
- Preserve existing invariants:
  - query returns citations when LLM synthesis fails;
  - ingest/lint worktree failures do not partially mutate main;
  - Git conflicts preserve the worktree for recovery;
  - filesystem adapters prevent path escape lexically and symlink-aware.

## Testing Rules

Use TDD for new logic and bug fixes unless the change is only docs, formatting, or a mechanical rename.

Use Contract-First development for new external capabilities or adapters:

1. Define the interface, port, or type signature.
2. Write contract tests against the interface behavior.
3. Implement the adapter/service.
4. Ensure the contract tests pass for every correct implementation.

Preferred loop:

1. Write a failing test.
2. Implement the minimal change.
3. Refactor with tests passing.

Testing priorities:

- Static analysis: typecheck and lint.
- Integration tests: main focus for adapters/services working together.
- Unit tests: pure logic and edge cases.
- E2E tests: targeted critical flows.

Test conventions:

- Test names should describe business behavior, e.g. `test_rememberFact_emptyContent_throwsContentEmpty`.
- Use Arrange-Act-Assert structure.
- Mock only external boundaries; do not mock business logic.
- Use `it.each` for repeated input variants.
- Each test should fail for one clear reason.

## Documentation Rules

- Accepted architecture decisions: `docs/adr/NNNN-title.md`.
- ADR index and rules: `docs/adr/README.md`.
- ADR template: `docs/adr/template.md`.
- Product development and deferred work: `docs/ROADMAP.md`.
- Keep documentation concise and current; do not recreate legacy planning/spec trees.

## Git Rules

- Check `git status --short --branch` before and after changes.
- Keep unrelated local changes intact.
- Commit coherent units of work with concise messages.
- Pull with rebase before pushing.
- Push completed work unless the user explicitly asks not to.

## Session Completion

When ending a development work session:

1. File or mention follow-up work that remains.
2. Run relevant quality gates if files changed.
3. Commit completed changes.
4. Push to remote:
   ```bash
   git pull --rebase
   git push
   git status --short --branch
   ```
5. Verify `git status` shows the branch is up to date with origin.
6. Hand off concise context for the next session.

Work is not complete until `git push` succeeds, unless the user explicitly asks not to push.
