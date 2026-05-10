# RM-0036: Defer secret-manager integrations

- Status: Deferred
- Priority: P2
- Area: scope
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - ADR-0002 (Local Solo Workstation Scope)
  - ADR-0009 (RE2-Based Sanitization)
  - ADR-0010 (Layered Configuration)
- Related items:
  - RM-0034 (privacy/sensitivity deferred-scope theme)
  - RM-0035 (privacy/sensitivity deferred-scope theme)

## Problem

Keep secret-manager integrations such as Vault or 1Password deferred.

## Goal

The roadmap concern is tracked independently with enough context to design, prioritize, implement, defer, or supersede it without expanding `docs/ROADMAP.md`.

## Non-goals

- Do not implement this scope unless the item status changes from Deferred.
- Do not record durable architecture decisions here; create or update an ADR when a decision is accepted.

## Proposed scope

- Preserve the intent of the original roadmap entry.
- Refine detailed behavior, affected packages, and verification steps when this item is selected for implementation.
- Link implementation PRs, ADRs, or follow-up items back to this record.

## Acceptance criteria

- The item is either implemented, intentionally deferred, superseded, or decomposed into smaller roadmap items.
- Relevant documentation, tests, or release notes are updated when behavior changes.
- Any durable architecture decision discovered during design is recorded as an ADR.
- Deferral rationale and revisit triggers are documented.
- Dependencies or owner decisions needed to revive the item are explicit.
- No implementation planning is requested while status remains Deferred.

## Design notes

Part of a deferred privacy/sensitivity scope theme. Keep deferred unless a security/privacy ADR narrows and accepts this product scope.

Deferral rationale:

- ADR-0002 keeps v1 focused on a local solo workstation with no hosted backend, multi-tenant authentication, ACLs, or federation.
- ADR-0010 already keeps API keys and machine-specific settings local through `.local/settings.local.yaml` and environment overrides.
- ADR-0009 already covers the accepted v1 protection boundary for accidental credential capture: RE2-based pattern sanitization with redact, warn, and block modes.
- Direct Vault, 1Password, keychain, or other secret-manager integrations would add provider-specific authentication, dependency, failure-mode, and support surface that is not required for the accepted local-first MVP.

Revisit triggers:

- Maintainers accept a security/privacy ADR that expands the credential-management boundary beyond local files and environment variables.
- A revived integrations roadmap item needs secret lookup indirection that cannot be satisfied safely by existing environment-variable or local-settings configuration.
- User evidence shows local config plus sanitization is insufficient for a supported workflow without copying secrets into committed Markdown or shared config.
- Team, hosted, or enterprise scope is accepted by a separate roadmap item or ADR and introduces central policy or credential-broker requirements.

Future technical planning should start by deciding whether this remains a generic secret-reference abstraction or becomes one or more concrete provider adapters. Do not design provider-specific behavior while the item is Deferred.

## Dependencies

None while Deferred.

Revival requires:

- Owner decision to change the item status from Deferred.
- Security/privacy ADR or accepted roadmap item defining the supported secret-manager boundary.
- Review of RM-0034 and RM-0035 so semantic sensitivity, per-project policy, and secret-manager behavior do not conflict.
- Decision on supported providers or on a provider-neutral secret-reference interface.
- Decision on fallback behavior when a secret manager is unavailable, locked, unauthenticated, or unsupported.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.
- Secret-manager integration can create a false sense of safety if memory content can still capture resolved secret values.
- Provider SDKs, CLIs, agents, and login sessions can make local workflows less reproducible and harder to test.
- A provider-neutral abstraction may avoid lock-in but can hide important differences in auth, audit, caching, and offline behavior.

## Open questions

Deferred until revival:

- Should support target a provider-neutral secret-reference interface, specific providers such as Vault or 1Password, or both?
- Should secret references be allowed only in local config, or also in shared config with unresolved placeholders?
- What should commands do when a referenced secret cannot be resolved: block, warn and continue without the feature, or fall back to environment variables?
- Does accepting this scope require a new ADR, or an update to ADR-0010 and ADR-0009?

## Future verification guidance

Only apply when the item is revived:

- Add contract tests for any secret-provider port or adapter before implementation.
- Add config-loader tests proving shared config never stores resolved secret values.
- Add failure-path tests for missing provider CLIs/SDKs, locked vaults, missing items, denied permissions, and offline operation.
- Add sanitization tests proving resolved values are not persisted to Markdown, state, logs, or Git history by new flows.
- Update README or configuration docs only after supported behavior is accepted and implemented.
