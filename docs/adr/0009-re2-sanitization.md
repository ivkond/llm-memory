# ADR-0009: RE2-Based Sanitization

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/ARCHITECTURE.md`
  - `.planning/codebase/STACK.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

Agents may accidentally write credentials, tokens, private keys, or connection strings into memory. Users can also configure custom patterns, which must not create catastrophic-backtracking risks.

## Decision

All write content passes through `SanitizationService` before persistence. Patterns are compiled with RE2. Sanitization supports `redact`, `warn`, and `block` modes, built-in secret patterns, custom patterns, and allowlists.

## Consequences

- Common secrets are redacted or blocked before they hit disk.
- Custom regex patterns are constrained to linear-time matching.
- RE2 is accepted as a native dependency for safety.
- Sanitization remains pattern-based, not semantic DLP.

## Alternatives considered

- No sanitization: rejected as unsafe for agent-written memory.
- JavaScript RegExp for custom patterns: rejected due to ReDoS risk.
- External DLP/secret manager integration: deferred as overkill for v1.

## Implementation notes

`SanitizationService` lives in core services and is configured through wiki config.

## Open questions

None.
