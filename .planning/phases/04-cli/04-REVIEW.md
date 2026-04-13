---
phase: 04-cli
reviewed: 2026-04-13T22:20:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - packages/cli/package.json
  - packages/cli/tsconfig.json
  - packages/cli/src/index.ts
  - packages/cli/src/commands/index.ts
  - packages/cli/src/commands/init.ts
  - packages/cli/src/commands/ingest.ts
  - packages/cli/src/commands/lint.ts
  - packages/cli/src/commands/import-cmd.ts
  - packages/cli/src/commands/search.ts
  - packages/cli/src/commands/status.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-13T22:20:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed 10 source files from Phase 04 (CLI implementation). The code builds successfully and all 314 tests pass. The CLI correctly uses commander subcommands and integrates with services from `@llm-wiki/common`. Found 3 warnings related to code duplication and input validation, plus 2 minor info items.

## Warnings

### WR-01: Duplicated findWikiRoot() function across all commands

**File:** `packages/cli/src/commands/ingest.ts:15-29`
**Issue:** The `findWikiRoot()` function is duplicated in all 6 command files (init.ts, ingest.ts, lint.ts, import-cmd.ts, search.ts, status.ts). This violates the DRY principle.
**Fix:** Extract to a shared utility in `packages/cli/src/utils.ts`:

```typescript
// packages/cli/src/utils.ts
import path from 'node:path';

export async function findWikiRoot(): Promise<string | null> {
  const candidates = [process.cwd(), path.join(process.env.HOME ?? '', '.llm-wiki')];
  for (const candidate of candidates) {
    try {
      const configPath = path.join(candidate, '.config', 'settings.shared.yaml');
      const { access } = await import('node:fs/promises');
      await access(configPath);
      return candidate;
    } catch {
      // Config not found here, continue
    }
  }
  return null;
}

export function getWikiPath(options: Record<string, unknown>, envVar = 'LLM_WIKI_PATH'): string | null {
  if (options.wiki) return String(options.wiki);
  const envPath = process.env[envVar];
  if (envPath) return envPath;
  return null;
}
```

Also duplicate in: lint.ts:16-29, import-cmd.ts:14-27, search.ts:11-24, status.ts:16-29

---

### WR-02: getWikiPathArg not reused across commands

**File:** `packages/cli/src/commands/ingest.ts:31-38`
**Issue:** The `getWikiPathArg()` helper function (duplicated pattern with getWikiPath above) appears only in ingest.ts but should be shared.
**Fix:** Include in shared utils file and remove from ingest.ts.

---

### WR-03: Missing input validation for --limit option in search command

**File:** `packages/cli/src/commands/search.ts:39`
**Issue:** `parseInt(options.limit ?? '10', 10)` returns `NaN` for invalid input like `--limit abc`, which could cause unexpected behavior in the query service.
**Fix:** Add validation after parsing:

```typescript
const limit = parseInt(options.limit ?? '10', 10);
if (isNaN(limit) || limit < 1 || limit > 100) {
  console.error('\x1b[31m%s\x1b[0m', 'Error: --limit must be a number between 1 and 100');
  process.exit(1);
}
```

---

## Info

### IN-01: Unused type import pattern

**File:** `packages/cli/src/index.ts:16`
**Issue:** `void Command;` is a workaround for TypeScript to include commander types without using them. More idiomatic would be to import types explicitly.
**Fix:** This pattern is acceptable, but could be documented or replaced with:

```typescript
import type { Command } from 'commander';
// No runtime import needed
```

---

### IN-02: Unused CommandModule type

**File:** `packages/cli/src/commands/index.ts:17-20`
**Issue:** `CommandModule` type is defined but not used anywhere for type checking.
**Fix:** Either remove if not needed, or use it to type-check command exports:

```typescript
import type { Command } from 'commander';

export type CommandModule = {
  readonly command: Command;
};
```

---

## Verification

- Build passes: `pnpm build` ✓
- Tests pass: 314 tests (151 core + 141 infra + 5 common + 16 mcp + 1 cli) ✓

---

_Reviewed: 2026-04-13T22:20:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_