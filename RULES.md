# Global Rules

> Universal coding and process rules.
> Apply to ALL projects. Project-specific rules — in `RULES.MD` at project root.

---

## CRITICAL — violation = failure

1. **Language**: Russian for responses and code comments. Technical terms in English.
2. **No stub code**: no `...`, `TODO`, `pass` (exception: staged stubs behind feature flag with docstring)
3. **Destructive actions — only after "go"**
4. **Protected files** (`.env`, `ci/**`, Docker/K8s/Terraform) — do not touch without request
5. **New logic = tests FIRST** (TDD)
6. **Principles**: TDD / SOLID / DRY / KISS / YAGNI / Clean Architecture — no exceptions
7. **Contract-First**: interface → contract tests → implementation
8. **Fail Fast**: unsure about direction → 3-5 line plan, ask

---

## Architecture

### Clean Architecture

**Dependency direction**: `Infrastructure → Application → Domain` (never reverse).
Forbidden: imports from infrastructure to application/domain.

**Layers:**

- **Domain**: types, protocols, business logic. No dependencies on external libraries (except stdlib)
- **Application**: use cases, orchestrators. Depends on Domain
- **Infrastructure**: frameworks, DB, HTTP, file system. Depends on Application and Domain

### SOLID

- **SRP** (Single Responsibility): one module = one reason to change. >3 public methods of different nature = violation. Class with >300 lines — candidate for splitting
- **OCP** (Open/Closed): extend through composition and Strategy pattern, not by editing existing code. New behavior = new class, not `if-else` in old one
- **LSP** (Liskov Substitution): subclass must work everywhere parent works. Violation: overriding method with different semantics
- **ISP** (Interface Segregation): Protocol/Interface ≤5 methods. Client should not depend on methods it doesn't use. Fat interface → split into several thin ones
- **DIP** (Dependency Inversion): depend on Protocol/ABC, not concrete classes. Constructor accepts abstraction, factory creates concrete

### DRY / KISS / YAGNI

- **DRY**: duplication >2 times → extract to function/class. BUT: do not extract if coincidence is accidental (different domains, different reasons to change)
- **KISS**: simple solution preferred over complex. Three identical lines better than premature abstraction. If solution requires explanation — it's too complex
- **YAGNI**: do not write code "for the future". Do not add feature flags, configuration, abstractions for hypothetical requirements. Add only when needed NOW

---

## TDD — Test-Driven Development

```
Red → Green → Refactor
```

1. Write failing test BEFORE code
2. Minimal implementation to make test pass
3. Refactor (remove duplication, improve naming)
4. Repeat

**When to skip TDD:** typos, formatting, exploratory prototypes.

### Contract-First Development

1. Define interface (Protocol / ABC / type signatures)
2. Write contract tests (test contract, not implementation)
3. Implement
4. Contract tests must pass for ANY correct implementation

---

## Tests — Testing Trophy

### Priority (Testing Trophy)

```
         /  E2E  \          ← targeted, critical flows
        / Integration \      ← MAIN FOCUS
       /    Unit Tests   \   ← pure logic, edge cases
      / Static Analysis    \ ← type checking, linting — always
```

- **Integration (main focus):** real components together, mock only external services (DB, HTTP, file system). If >5 mocks — candidate for integration test
- **Unit:** pure logic, edge cases, boundary values. Fast, isolated
- **E2E:** only critical user flows. Expensive, fragile — minimum
- **Static:** type checking, linting — always, on every commit

### Test Writing Rules

- **Name = business requirement**: `test_<what>_<condition>_<result>`. Example: `test_evidence_pack_caps_rel_facts_at_ten`
- **Assert = business fact**: each assert checks specific requirement or edge case

```python
# Bad — meaningless assert
assert result is not None

# Good — checks business requirement
assert len(pack.rel_facts) <= 10
assert encoder.sigma > 0
assert loss < initial_loss * 0.8
```

- **Mock only external boundaries**: DB, HTTP API, file system, third-party services. Do NOT mock business logic — use in-memory implementations
- **Variations via `@parametrize`**, not test copy-paste
- **Each test = one scenario**: do not check 5 things in one test
- **Test must fail for one reason**: if failed — immediately clear what's broken
- **Arrange-Act-Assert**: clear separation of setup / action / verification
- **Specification by Example**: requirements as concrete inputs/outputs = ready test cases

### Markers

- `@pytest.mark.slow` — tests >10 seconds (ML convergence, statistical)
- `@pytest.mark.gpu` — require GPU
- Project-specific markers — in `RULES.MD` of project

### Coverage

- Target: **85%+** overall
- Core/business logic: **95%+**
- Infrastructure/adapters: **70%+**
- Project-specific targets by layer — in `RULES.MD` of project

---

## Coding Standards

### General

- Full imports, valid syntax, complete functions — code copy-paste ready
- No placeholders: no `TODO`, `...`, pseudocode
- No new libraries/frameworks without explicit request
- Multi-file changes → plan first, then implementation

### Refactoring

- **Strangler Fig**: new code wraps old, gradual replacement with tests
- Each refactoring step — tests pass. Never break tests "for a while"
- Renaming: find ALL usages (grep/IDE), do not guess

### Architectural Decisions

- Significant decision → ADR (context → solution → alternatives → consequences)
- Before architectural change — check existing ADRs

### Response Format

- Structure: **Goal → Action → Result**
- Code: complete functions, copy-paste ready, full imports

---

## Staged stubs (allowed)

Stub = complete Protocol/Interface implementation + docstring (what, what replaces, when).
Stub behind feature flag. Without feature flag — not stub, but production code.
