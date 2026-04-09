# Milestone 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up TypeScript monorepo with core domain entities, ports, FileStore/ConfigLoader adapters, SanitizationService, RememberService, and RecallService — enabling verbatim write and deterministic read of wiki knowledge.

**Architecture:** Clean Architecture with ports/adapters. `@llm-wiki/core` contains domain entities and port interfaces (zero external deps). `@llm-wiki/infra` implements ports via filesystem and YAML. Services in core orchestrate through ports only. Contract tests validate port behavior for any adapter.

**Tech Stack:** TypeScript 5.x, pnpm workspaces, Vitest, gray-matter (frontmatter parsing), js-yaml, uuid, node:fs/promises

**Spec:** `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

**Invariants covered (from spec):**
- INV-1: `wiki_remember_fact` returns within 100ms, never calls LLM
- INV-2: `wiki_recall` for unknown project returns wiki-only context, never errors
- INV-7: Sanitization redacts all patterns before content reaches disk
- INV-8: `wiki_remember_session` with same `session_id` is idempotent
- INV-11: `wiki_recall` is deterministic: same wiki state + same cwd = same response
- INV-12: `wiki_recall` never calls LLM

---

## File Structure

```
llm-memory/
  package.json                              # root workspace config
  pnpm-workspace.yaml                       # pnpm workspace definition
  tsconfig.base.json                        # shared TS config
  vitest.workspace.ts                       # vitest workspace config
  .gitignore                                # updated with node_modules, dist, .local/

  packages/
    core/
      package.json
      tsconfig.json
      src/
        domain/
          wiki-page.ts                      # WikiPage entity
          verbatim-entry.ts                 # VerbatimEntry entity
          project.ts                        # Project entity
          sanitization-result.ts            # SanitizationResult value object
          errors.ts                         # Domain error types
        ports/
          file-store.ts                     # IFileStore interface
          project-resolver.ts               # IProjectResolver interface
          version-control.ts                # IVersionControl interface (stub for M1)
          index.ts                          # re-exports
        services/
          sanitization-service.ts           # Pure logic: pattern matching + redaction
          remember-service.ts               # Orchestrates: FileStore + Sanitizer
          recall-service.ts                 # Orchestrates: ProjectResolver + FileStore
          index.ts                          # re-exports
        index.ts                            # package entry point
      tests/
        domain/
          wiki-page.test.ts
          verbatim-entry.test.ts
          sanitization-result.test.ts
        services/
          sanitization-service.test.ts
          remember-service.test.ts
          recall-service.test.ts

    infra/
      package.json
      tsconfig.json
      src/
        fs-file-store.ts                    # IFileStore via node:fs
        git-project-resolver.ts             # IProjectResolver via git remote
        config-loader.ts                    # Loads shared + local YAML, env merge
        index.ts
      tests/
        fs-file-store.test.ts               # Contract tests for IFileStore
        git-project-resolver.test.ts
        config-loader.test.ts
```

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.workspace.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/infra/package.json`, `packages/infra/tsconfig.json`
- Modify: `.gitignore`

- [ ] **Step 1: Initialize root package.json**

```json
{
  "name": "llm-wiki",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 4: Create packages/core/package.json**

```json
{
  "name": "@llm-wiki/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 5: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create packages/infra/package.json**

```json
{
  "name": "@llm-wiki/infra",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@llm-wiki/core": "workspace:*",
    "js-yaml": "^4.1.0",
    "simple-git": "^3.27.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "@types/js-yaml": "^4.0.9"
  }
}
```

- [ ] **Step 7: Create packages/infra/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 8: Create vitest.workspace.ts**

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/core',
  'packages/infra',
]);
```

Add vitest config to each package — create `packages/core/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
```

Create `packages/infra/vitest.config.ts` with source aliases so tests resolve workspace packages to TypeScript source (not compiled dist):

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@llm-wiki/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
```

- [ ] **Step 9: Update .gitignore**

```
.ai
.claude
.uv-cache
node_modules
dist
*.tsbuildinfo
.local/
```

- [ ] **Step 10: Install dependencies and verify**

Run: `pnpm install`
Expected: Lockfile created, no errors.

Run: `pnpm lint`
Expected: Passes (no source files yet).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m ":tada: [init] TypeScript monorepo with core and infra packages"
```

---

## Task 2: Domain entities

**Files:**
- Create: `packages/core/src/domain/errors.ts`
- Create: `packages/core/src/domain/wiki-page.ts`
- Create: `packages/core/src/domain/verbatim-entry.ts`
- Create: `packages/core/src/domain/project.ts`
- Create: `packages/core/src/domain/sanitization-result.ts`
- Test: `packages/core/tests/domain/wiki-page.test.ts`
- Test: `packages/core/tests/domain/verbatim-entry.test.ts`
- Test: `packages/core/tests/domain/sanitization-result.test.ts`

- [ ] **Step 1: Write domain error types**

```typescript
// packages/core/src/domain/errors.ts

export class WikiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WikiError';
  }
}

export class ContentEmptyError extends WikiError {
  constructor() {
    super('CONTENT_EMPTY', 'Content must not be empty');
  }
}

export class SanitizationBlockedError extends WikiError {
  constructor(public readonly redactedRatio: number) {
    super(
      'SANITIZATION_BLOCKED',
      `Content is ${Math.round(redactedRatio * 100)}% redacted — likely a credentials dump`,
    );
  }
}

export class WikiNotInitializedError extends WikiError {
  constructor(path: string) {
    super('WIKI_NOT_INITIALIZED', `Wiki not initialized at ${path}`);
  }
}

export class WikiEmptyError extends WikiError {
  constructor() {
    super('WIKI_EMPTY', 'No pages exist in the wiki');
  }
}
```

- [ ] **Step 2: Write failing tests for WikiPage**

```typescript
// packages/core/tests/domain/wiki-page.test.ts
import { describe, it, expect } from 'vitest';
import { WikiPage } from '../../src/domain/wiki-page.js';

describe('WikiPage', () => {
  // Domain entity tests use fromParsedData — no gray-matter dependency in domain.
  // Parsing (markdown → WikiPageData) is tested in infra/FsFileStore.

  it('test_fromParsedData_validData_constructsAllFields', () => {
    const page = WikiPage.fromParsedData('wiki/concepts/test.md', {
      frontmatter: {
        title: 'Test Page',
        created: '2026-04-09',
        updated: '2026-04-09',
        confidence: 0.9,
        sources: ['projects/cli-relay/practices.md'],
        supersedes: null,
        tags: ['testing', 'postgresql'],
      },
      content: '## Summary\n\nSome content here.\n\n## See also\n\n- [Other page](../tools/pg.md)',
    });

    expect(page.path).toBe('wiki/concepts/test.md');
    expect(page.title).toBe('Test Page');
    expect(page.confidence).toBe(0.9);
    expect(page.tags).toEqual(['testing', 'postgresql']);
    expect(page.sources).toEqual(['projects/cli-relay/practices.md']);
    expect(page.supersedes).toBeNull();
    expect(page.content).toContain('Some content here.');
    expect(page.crossrefs).toEqual(['../tools/pg.md']);
  });

  it('test_fromParsedData_missingTitle_usesFilename', () => {
    const page = WikiPage.fromParsedData('wiki/concepts/my-topic.md', {
      frontmatter: {
        title: undefined as unknown as string,
        created: '2026-04-09',
        updated: '2026-04-09',
        confidence: 0.5,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: 'Content.',
    });
    expect(page.title).toBe('my-topic');
  });

  it('test_toData_roundtrip_preservesContent', () => {
    const original = WikiPage.fromParsedData('wiki/test.md', {
      frontmatter: {
        title: 'Test Page',
        created: '2026-04-09',
        updated: '2026-04-09',
        confidence: 0.9,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: '## Summary\n\nContent here.',
    });

    const data = original.toData();
    const reparsed = WikiPage.fromParsedData('wiki/test.md', data);

    expect(reparsed.title).toBe(original.title);
    expect(reparsed.confidence).toBe(original.confidence);
    expect(reparsed.content).toContain('Content here.');
  });

  it('test_summary_extractsFirstParagraph', () => {
    const page = WikiPage.fromParsedData('wiki/test.md', {
      frontmatter: {
        title: 'Test',
        created: '2026-04-09',
        updated: '2026-04-09',
        confidence: 0.5,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: '## Summary\n\nFirst paragraph is the summary.\n\n## Details\n\nMore details here.',
    });
    expect(page.summary).toBe('First paragraph is the summary.');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/tests/domain/wiki-page.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement WikiPage**

```typescript
// packages/core/src/domain/wiki-page.ts
// Domain entity — zero external dependencies.
// Parsing (gray-matter) lives in the infrastructure layer (see FsFileStore).
// This entity is constructed from already-parsed data.

export interface WikiPageFrontmatter {
  title: string;
  created: string;
  updated: string;
  confidence: number;
  sources: string[];
  supersedes: string | null;
  tags: string[];
}

export interface WikiPageData {
  frontmatter: WikiPageFrontmatter;
  content: string;
}

export class WikiPage {
  private constructor(
    public readonly path: string,
    public readonly title: string,
    public readonly created: string,
    public readonly updated: string,
    public readonly confidence: number,
    public readonly sources: string[],
    public readonly supersedes: string | null,
    public readonly tags: string[],
    public readonly content: string,
  ) {}

  /** Construct from pre-parsed data. Parsing (gray-matter) belongs in infra. */
  static fromParsedData(filePath: string, data: WikiPageData): WikiPage {
    const basename = filePath.split('/').pop()?.replace('.md', '') ?? 'untitled';

    return new WikiPage(
      filePath,
      data.frontmatter.title ?? basename,
      data.frontmatter.created ?? new Date().toISOString().slice(0, 10),
      data.frontmatter.updated ?? new Date().toISOString().slice(0, 10),
      data.frontmatter.confidence ?? 0.5,
      data.frontmatter.sources ?? [],
      data.frontmatter.supersedes ?? null,
      data.frontmatter.tags ?? [],
      data.content.trim(),
    );
  }

  /** Serialize back to frontmatter + content structure. Actual markdown rendering in infra. */
  toData(): WikiPageData {
    return {
      frontmatter: {
        title: this.title,
        created: this.created,
        updated: this.updated,
        confidence: this.confidence,
        sources: this.sources,
        supersedes: this.supersedes,
        tags: this.tags,
      },
      content: this.content,
    };
  }

  get summary(): string {
    const lines = this.content.split('\n');
    const paragraphs: string[] = [];
    let current = '';

    for (const line of lines) {
      if (line.startsWith('#')) {
        if (current.trim()) paragraphs.push(current.trim());
        current = '';
        continue;
      }
      if (line.trim() === '') {
        if (current.trim()) paragraphs.push(current.trim());
        current = '';
        continue;
      }
      current += (current ? ' ' : '') + line.trim();
    }
    if (current.trim()) paragraphs.push(current.trim());

    return paragraphs[0] ?? '';
  }

  get crossrefs(): string[] {
    const linkRegex = /\[([^\]]*)\]\(([^)]+\.md)\)/g;
    const refs: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(this.content)) !== null) {
      refs.push(match[2]);
    }
    return refs;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/tests/domain/wiki-page.test.ts`
Expected: ALL PASS.

- [ ] **Step 6: Write failing tests for VerbatimEntry**

```typescript
// packages/core/tests/domain/verbatim-entry.test.ts
import { describe, it, expect } from 'vitest';
import { VerbatimEntry } from '../../src/domain/verbatim-entry.js';

describe('VerbatimEntry', () => {
  it('test_create_withRequiredFields_generatesUniqueFilename', () => {
    const entry = VerbatimEntry.create({
      content: '- pgx pool MaxConns <= max_connections/3',
      agent: 'claude-code',
      project: 'cli-relay',
      sessionId: 'abc123',
    });

    expect(entry.agent).toBe('claude-code');
    expect(entry.project).toBe('cli-relay');
    expect(entry.sessionId).toBe('abc123');
    expect(entry.consolidated).toBe(false);
    expect(entry.content).toContain('pgx pool MaxConns');
    expect(entry.filename).toMatch(/^\d{4}-\d{2}-\d{2}-abc123-[a-f0-9]+\.md$/);
  });

  it('test_create_twoEntries_differentFilenames', () => {
    const opts = {
      content: 'fact',
      agent: 'claude-code',
      sessionId: 'abc',
    };
    const a = VerbatimEntry.create(opts);
    const b = VerbatimEntry.create(opts);
    expect(a.filename).not.toBe(b.filename);
  });

  it('test_toData_serializesCorrectly', () => {
    const entry = VerbatimEntry.create({
      content: '- Test fact\n- Another fact',
      agent: 'claude-code',
      project: 'cli-relay',
      sessionId: 'abc123',
    });
    const data = entry.toData();

    expect(data.session).toBe('abc123');
    expect(data.project).toBe('cli-relay');
    expect(data.agent).toBe('claude-code');
    expect(data.consolidated).toBe(false);
    expect(data.content).toContain('- Test fact');
    expect(data.content).toContain('- Another fact');
  });

  it('test_fromParsedData_roundtrip_preservesData', () => {
    const entry = VerbatimEntry.create({
      content: '- Fact here',
      agent: 'cursor',
      sessionId: 'xyz',
    });
    const data = entry.toData();
    const parsed = VerbatimEntry.fromParsedData(entry.filename, data);

    expect(parsed.agent).toBe('cursor');
    expect(parsed.sessionId).toBe('xyz');
    expect(parsed.consolidated).toBe(false);
    expect(parsed.content).toContain('Fact here');
  });

  it('test_filePath_includesAgentDirectory', () => {
    const entry = VerbatimEntry.create({
      content: 'fact',
      agent: 'claude-code',
      sessionId: 'abc',
    });
    expect(entry.filePath).toBe(`log/claude-code/raw/${entry.filename}`);
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/tests/domain/verbatim-entry.test.ts`
Expected: FAIL.

- [ ] **Step 8: Implement VerbatimEntry**

```typescript
// packages/core/src/domain/verbatim-entry.ts
// Domain entity — zero external dependencies.
// UUID generation is injected via idGenerator param.
// Markdown serialization (gray-matter) lives in infra (FsFileStore).

export interface CreateVerbatimEntryOptions {
  content: string;
  agent: string;
  sessionId: string;
  project?: string;
  tags?: string[];
  /** Injected ID generator — keeps domain free of uuid dependency */
  idGenerator?: () => string;
}

export interface VerbatimEntryData {
  session: string;
  agent: string;
  project?: string;
  tags?: string[];
  consolidated: boolean;
  created: string;
  content: string;
}

export class VerbatimEntry {
  private constructor(
    public readonly filename: string,
    public readonly agent: string,
    public readonly sessionId: string,
    public readonly project: string | undefined,
    public readonly tags: string[],
    public readonly consolidated: boolean,
    public readonly created: string,
    public readonly content: string,
  ) {}

  /** Create a new entry. UUID generation injected, defaults to random hex. */
  static create(opts: CreateVerbatimEntryOptions): VerbatimEntry {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const genId = opts.idGenerator ?? (() => Math.random().toString(16).slice(2, 10));
    const uuid = genId();
    const filename = `${date}-${opts.sessionId}-${uuid}.md`;

    return new VerbatimEntry(
      filename,
      opts.agent,
      opts.sessionId,
      opts.project,
      opts.tags ?? [],
      false,
      now.toISOString(),
      opts.content,
    );
  }

  /** Construct from pre-parsed data. Parsing (gray-matter) belongs in infra. */
  static fromParsedData(filename: string, data: VerbatimEntryData): VerbatimEntry {
    return new VerbatimEntry(
      filename,
      data.agent,
      data.session,
      data.project,
      data.tags ?? [],
      data.consolidated ?? false,
      data.created ?? new Date().toISOString(),
      data.content.trim(),
    );
  }

  get filePath(): string {
    return `log/${this.agent}/raw/${this.filename}`;
  }

  /** Serialize to structured data. Actual markdown rendering in infra. */
  toData(): VerbatimEntryData {
    return {
      session: this.sessionId,
      agent: this.agent,
      project: this.project,
      tags: this.tags.length > 0 ? this.tags : undefined,
      consolidated: this.consolidated,
      created: this.created,
      content: this.content,
    };
  }
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/tests/domain/verbatim-entry.test.ts`
Expected: ALL PASS.

- [ ] **Step 10: Implement Project entity and SanitizationResult value object**

```typescript
// packages/core/src/domain/project.ts
// Domain entity — zero external dependencies.

export interface ProjectData {
  name: string;
  git_remote: string;
  description?: string;
}

export class Project {
  constructor(
    public readonly name: string,
    public readonly gitRemote: string,
    public readonly description: string,
  ) {}

  static fromData(data: ProjectData): Project {
    return new Project(
      data.name,
      data.git_remote,
      data.description ?? '',
    );
  }

  toData(): ProjectData {
    return {
      name: this.name,
      git_remote: this.gitRemote,
      description: this.description,
    };
  }
}
```

```typescript
// packages/core/src/domain/sanitization-result.ts

export interface RedactionWarning {
  type: string;
  position: number;
  original_length: number;
}

export class SanitizationResult {
  constructor(
    public readonly content: string,
    public readonly warnings: RedactionWarning[],
    public readonly redactedRatio: number,
  ) {}

  get isBlocked(): boolean {
    return this.redactedRatio > 0.5;
  }

  get isClean(): boolean {
    return this.warnings.length === 0;
  }
}
```

- [ ] **Step 11: Write SanitizationResult test**

```typescript
// packages/core/tests/domain/sanitization-result.test.ts
import { describe, it, expect } from 'vitest';
import { SanitizationResult } from '../../src/domain/sanitization-result.js';

describe('SanitizationResult', () => {
  it('test_isBlocked_over50percent_returnsTrue', () => {
    const result = new SanitizationResult('redacted', [{ type: 'api_key', position: 0, original_length: 100 }], 0.6);
    expect(result.isBlocked).toBe(true);
  });

  it('test_isBlocked_under50percent_returnsFalse', () => {
    const result = new SanitizationResult('mostly clean', [{ type: 'api_key', position: 5, original_length: 10 }], 0.1);
    expect(result.isBlocked).toBe(false);
  });

  it('test_isClean_noWarnings_returnsTrue', () => {
    const result = new SanitizationResult('clean content', [], 0);
    expect(result.isClean).toBe(true);
  });
});
```

- [ ] **Step 12: Run all domain tests**

Run: `pnpm vitest run packages/core/tests/domain/`
Expected: ALL PASS.

- [ ] **Step 13: Create domain index and core entry point**

```typescript
// packages/core/src/domain/index.ts
export { WikiPage } from './wiki-page.js';
export type { WikiPageFrontmatter, WikiPageData } from './wiki-page.js';
export { VerbatimEntry } from './verbatim-entry.js';
export type { CreateVerbatimEntryOptions, VerbatimEntryData } from './verbatim-entry.js';
export { Project } from './project.js';
export { SanitizationResult } from './sanitization-result.js';
export type { RedactionWarning } from './sanitization-result.js';
export {
  WikiError,
  ContentEmptyError,
  SanitizationBlockedError,
  WikiNotInitializedError,
  WikiEmptyError,
} from './errors.js';
```

- [ ] **Step 14: Commit**

```bash
git add packages/core/src/domain packages/core/tests/domain
git commit -m ":sparkles: [core] Domain entities: WikiPage, VerbatimEntry, Project, SanitizationResult"
```

---

## Task 3: Port interfaces

**Files:**
- Create: `packages/core/src/ports/file-store.ts`
- Create: `packages/core/src/ports/verbatim-store.ts`
- Create: `packages/core/src/ports/project-resolver.ts`
- Create: `packages/core/src/ports/version-control.ts`
- Create: `packages/core/src/ports/index.ts`

- [ ] **Step 1: Define IFileStore port (generic file I/O, 5 methods — ISP compliant)**

```typescript
// packages/core/src/ports/file-store.ts

export interface FileInfo {
  path: string;
  updated: string;
}

export interface IFileStore {
  /** Read raw file content. Returns null if not found. */
  readFile(relativePath: string): Promise<string | null>;

  /** Write content to a file. Creates parent dirs if needed. */
  writeFile(relativePath: string, content: string): Promise<void>;

  /** List all markdown files under a directory. */
  listFiles(directory: string): Promise<FileInfo[]>;

  /** Check if a file exists. */
  exists(relativePath: string): Promise<boolean>;

  /** Read and parse a markdown file into WikiPageData. Returns null if not found.
   *  Parsing (gray-matter) is owned by infra — single parser path. */
  readWikiPage(relativePath: string): Promise<import('../domain/wiki-page.js').WikiPageData | null>;
}
```

- [ ] **Step 1b: Define IVerbatimStore port (verbatim-specific operations, 3 methods)**

```typescript
// packages/core/src/ports/verbatim-store.ts
import type { VerbatimEntry } from '../domain/verbatim-entry.js';
import type { FileInfo } from './file-store.js';

export interface IVerbatimStore {
  /** Write a VerbatimEntry to disk as markdown (serialization owned by infra). */
  writeEntry(entry: VerbatimEntry): Promise<void>;

  /** Find verbatim entries with consolidated: false for a given agent. */
  listUnconsolidated(agent: string): Promise<FileInfo[]>;

  /** Count unconsolidated entries across all agents. */
  countUnconsolidated(): Promise<number>;
}
```

- [ ] **Step 2: Define IProjectResolver port**

```typescript
// packages/core/src/ports/project-resolver.ts

export interface IProjectResolver {
  /**
   * Resolve cwd to a project name.
   * Returns null if the directory is not a git repo or not mapped to any project.
   */
  resolve(cwd: string): Promise<string | null>;

  /**
   * Get the git remote URL for a directory.
   * Returns null if not a git repo.
   */
  getRemoteUrl(cwd: string): Promise<string | null>;
}
```

- [ ] **Step 3: Define IVersionControl port (stub for M1)**

```typescript
// packages/core/src/ports/version-control.ts

export interface IVersionControl {
  /** Commit specific files with a message. */
  commit(files: string[], message: string): Promise<string>;

  /** Check for uncommitted changes. */
  hasUncommittedChanges(): Promise<boolean>;
}
```

Note: worktree, squash, and conflict resolution methods will be added in Milestone 2.

- [ ] **Step 4: Create ports index**

```typescript
// packages/core/src/ports/index.ts
export type { IFileStore, FileInfo } from './file-store.js';
export type { IVerbatimStore } from './verbatim-store.js';
export type { IProjectResolver } from './project-resolver.js';
export type { IVersionControl } from './version-control.js';
```

- [ ] **Step 5: Update core entry point**

```typescript
// packages/core/src/index.ts
export * from './domain/index.js';
export * from './ports/index.js';
export * from './services/index.js';
```

Create empty services index:

```typescript
// packages/core/src/services/index.ts
// Services will be added in subsequent tasks
```

- [ ] **Step 6: Verify build**

Run: `pnpm --filter @llm-wiki/core build`
Expected: Compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/ports packages/core/src/index.ts packages/core/src/services/index.ts
git commit -m ":sparkles: [core] Port interfaces: IFileStore, IProjectResolver, IVersionControl"
```

---

## Task 4: SanitizationService

**Files:**
- Create: `packages/core/src/services/sanitization-service.ts`
- Test: `packages/core/tests/services/sanitization-service.test.ts`

- [ ] **Step 1: Write failing tests (covers INV-7)**

```typescript
// packages/core/tests/services/sanitization-service.test.ts
import { describe, it, expect } from 'vitest';
import { SanitizationService } from '../../src/services/sanitization-service.js';

describe('SanitizationService', () => {
  const service = new SanitizationService({ enabled: true, mode: 'redact' });

  it('test_sanitize_awsKey_redactsCorrectly', () => {
    const result = service.sanitize('My key is AKIAIOSFODNN7EXAMPLE and more text');
    expect(result.content).toContain('[REDACTED:aws_key]');
    expect(result.content).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('aws_key');
  });

  it('test_sanitize_githubToken_redactsCorrectly', () => {
    const result = service.sanitize('Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
    expect(result.content).toContain('[REDACTED:github_token]');
    expect(result.content).not.toContain('ghp_');
  });

  it('test_sanitize_genericApiKey_redactsCorrectly', () => {
    const result = service.sanitize('API key: sk-abc123def456ghi789jkl012mno345pqr678');
    expect(result.content).toContain('[REDACTED:api_key]');
  });

  it('test_sanitize_jwtToken_redactsCorrectly', () => {
    const result = service.sanitize('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
    expect(result.content).toContain('[REDACTED:jwt]');
  });

  it('test_sanitize_privateKey_redactsCorrectly', () => {
    const result = service.sanitize('Key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----');
    expect(result.content).toContain('[REDACTED:private_key]');
  });

  it('test_sanitize_connectionString_redactsPassword', () => {
    const result = service.sanitize('DB: postgresql://user:s3cretP@ss@localhost:5432/mydb');
    expect(result.content).toContain('[REDACTED:connection_string]');
    expect(result.content).not.toContain('s3cretP@ss');
  });

  it('test_sanitize_cleanContent_returnsUnchanged', () => {
    const content = 'This is normal technical content about PostgreSQL connection pooling.';
    const result = service.sanitize(content);
    expect(result.content).toBe(content);
    expect(result.isClean).toBe(true);
  });

  it('test_sanitize_disabledMode_returnsUnchanged', () => {
    const disabled = new SanitizationService({ enabled: false, mode: 'redact' });
    const content = 'Key: sk-abc123def456ghi789jkl012mno345pqr678';
    const result = disabled.sanitize(content);
    expect(result.content).toBe(content);
  });

  it('test_sanitize_majorityRedacted_blocksContent', () => {
    const content = 'sk-key1abc123def456 sk-key2abc123def456 sk-key3abc123def456';
    const result = service.sanitize(content);
    expect(result.isBlocked).toBe(true);
  });

  it('test_sanitize_multiplePatterns_redactsAll', () => {
    const content = 'AWS: AKIAIOSFODNN7EXAMPLE, GitHub: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const result = service.sanitize(content);
    expect(result.content).toContain('[REDACTED:aws_key]');
    expect(result.content).toContain('[REDACTED:github_token]');
    expect(result.warnings).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/tests/services/sanitization-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement SanitizationService**

```typescript
// packages/core/src/services/sanitization-service.ts
import { SanitizationResult } from '../domain/sanitization-result.js';
import type { RedactionWarning } from '../domain/sanitization-result.js';

export interface SanitizationConfig {
  enabled: boolean;
  mode: 'redact' | 'warn' | 'block';
  customPatterns?: string[];
  allowlist?: string[];
}

interface PatternRule {
  name: string;
  pattern: RegExp;
}

const DEFAULT_PATTERNS: PatternRule[] = [
  { name: 'private_key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'aws_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'github_token', pattern: /\b(ghp|gho|github_pat)_[A-Za-z0-9_]{30,}\b/g },
  { name: 'api_key', pattern: /\b(sk-|sk_live_|pk_live_)[A-Za-z0-9]{20,}\b/g },
  { name: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'connection_string', pattern: /\b(postgresql|mysql|mongodb|redis):\/\/[^\s]+:[^\s@]+@[^\s]+/g },
];

export class SanitizationService {
  private readonly patterns: PatternRule[];

  constructor(private readonly config: SanitizationConfig) {
    this.patterns = [...DEFAULT_PATTERNS];
    if (config.customPatterns) {
      for (const p of config.customPatterns) {
        this.patterns.push({ name: 'custom', pattern: new RegExp(p, 'g') });
      }
    }
  }

  sanitize(content: string): SanitizationResult {
    if (!this.config.enabled) {
      return new SanitizationResult(content, [], 0);
    }

    const warnings: RedactionWarning[] = [];
    let result = content;
    let totalRedactedLength = 0;

    for (const rule of this.patterns) {
      // Reset regex lastIndex for each run
      rule.pattern.lastIndex = 0;

      result = result.replace(rule.pattern, (match, ...args) => {
        const offset = typeof args[args.length - 2] === 'number' ? args[args.length - 2] : 0;
        warnings.push({
          type: rule.name,
          position: offset as number,
          original_length: match.length,
        });
        totalRedactedLength += match.length;
        return `[REDACTED:${rule.name}]`;
      });
    }

    const redactedRatio = content.length > 0 ? totalRedactedLength / content.length : 0;
    return new SanitizationResult(result, warnings, redactedRatio);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/tests/services/sanitization-service.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/sanitization-service.ts packages/core/tests/services/sanitization-service.test.ts
git commit -m ":sparkles: [core] SanitizationService with pattern-based redaction (INV-7)"
```

---

## Task 5: FsFileStore adapter

**Files:**
- Create: `packages/infra/src/fs-file-store.ts`
- Test: `packages/infra/tests/fs-file-store.test.ts`

- [ ] **Step 1: Write failing contract tests**

```typescript
// packages/infra/tests/fs-file-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsFileStore } from '../src/fs-file-store.js';

describe('FsFileStore', () => {
  let tempDir: string;
  let store: FsFileStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-test-'));
    store = new FsFileStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('test_writeFile_then_readFile_returnsContent', async () => {
    await store.writeFile('wiki/test.md', '# Hello');
    const content = await store.readFile('wiki/test.md');
    expect(content).toBe('# Hello');
  });

  it('test_readFile_nonExistent_returnsNull', async () => {
    const content = await store.readFile('does/not/exist.md');
    expect(content).toBeNull();
  });

  it('test_writeFile_createsParentDirs', async () => {
    await store.writeFile('deep/nested/dir/file.md', 'content');
    const content = await store.readFile('deep/nested/dir/file.md');
    expect(content).toBe('content');
  });

  it('test_listFiles_returnsSortedByMtimeDesc', async () => {
    await store.writeFile('wiki/old.md', '---\nupdated: 2026-01-01\n---\nold');
    // Small delay to ensure different mtime
    await new Promise(r => setTimeout(r, 50));
    await store.writeFile('wiki/new.md', '---\nupdated: 2026-04-01\n---\nnew');

    const files = await store.listFiles('wiki');
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('wiki/new.md');
    expect(files[1].path).toBe('wiki/old.md');
  });

  it('test_listFiles_emptyDir_returnsEmpty', async () => {
    const files = await store.listFiles('nonexistent');
    expect(files).toEqual([]);
  });

  it('test_exists_existingFile_returnsTrue', async () => {
    await store.writeFile('test.md', 'content');
    expect(await store.exists('test.md')).toBe(true);
  });

  it('test_exists_missingFile_returnsFalse', async () => {
    expect(await store.exists('missing.md')).toBe(false);
  });

  it('test_deleteFile_removesFile', async () => {
    await store.writeFile('test.md', 'content');
    await store.deleteFile('test.md');
    expect(await store.exists('test.md')).toBe(false);
  });

  it('test_listUnconsolidatedEntries_findsOnlyFalse', async () => {
    await store.writeFile(
      'log/claude-code/raw/2026-04-09-abc-1111.md',
      '---\nconsolidated: false\n---\nfact1',
    );
    await store.writeFile(
      'log/claude-code/raw/2026-04-09-abc-2222.md',
      '---\nconsolidated: true\n---\nfact2',
    );

    const entries = await store.listUnconsolidatedEntries('claude-code');
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toContain('1111');
  });

  it('test_countUnconsolidated_countsAcrossAgents', async () => {
    await store.writeFile(
      'log/claude-code/raw/2026-04-09-a-1111.md',
      '---\nconsolidated: false\n---\nfact',
    );
    await store.writeFile(
      'log/cursor/raw/2026-04-09-b-2222.md',
      '---\nconsolidated: false\n---\nfact',
    );

    const count = await store.countUnconsolidated();
    expect(count).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/infra/tests/fs-file-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement FsFileStore**

```typescript
// packages/infra/src/fs-file-store.ts
import { readFile, writeFile, readdir, stat, mkdir, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { IFileStore, FileInfo, VerbatimEntry } from '@llm-wiki/core';

export class FsFileStore implements IFileStore {
  constructor(private readonly rootDir: string) {}

  async readFile(relativePath: string): Promise<string | null> {
    try {
      return await readFile(path.join(this.rootDir, relativePath), 'utf-8');
    } catch {
      return null;
    }
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.rootDir, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  async listFiles(directory: string): Promise<FileInfo[]> {
    const dirPath = path.join(this.rootDir, directory);
    try {
      await access(dirPath);
    } catch {
      return [];
    }

    const results: FileInfo[] = [];
    await this.walkDir(dirPath, directory, results);

    results.sort((a, b) => {
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    return results;
  }

  private async walkDir(absDir: string, relDir: string, results: FileInfo[]): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      const relPath = path.join(relDir, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        await this.walkDir(absPath, relPath, results);
      } else if (entry.name.endsWith('.md')) {
        const stats = await stat(absPath);
        results.push({
          path: relPath,
          updated: stats.mtime.toISOString(),
        });
      }
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await access(path.join(this.rootDir, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(relativePath: string): Promise<void> {
    await unlink(path.join(this.rootDir, relativePath));
  }

  async listUnconsolidatedEntries(agent: string): Promise<FileInfo[]> {
    const dir = `log/${agent}/raw`;
    const files = await this.listFiles(dir);
    const unconsolidated: FileInfo[] = [];

    for (const file of files) {
      const content = await this.readFile(file.path);
      if (content) {
        const { data } = matter(content);
        if (data.consolidated === false) {
          unconsolidated.push(file);
        }
      }
    }

    return unconsolidated;
  }

  async countUnconsolidated(): Promise<number> {
    const logDir = path.join(this.rootDir, 'log');
    let count = 0;

    try {
      const agents = await readdir(logDir, { withFileTypes: true });
      for (const agent of agents) {
        if (agent.isDirectory()) {
          const entries = await this.listUnconsolidatedEntries(agent.name);
          count += entries.length;
        }
      }
    } catch {
      // log/ doesn't exist yet
    }

    return count;
  }

  async readWikiPage(relativePath: string): Promise<import('@llm-wiki/core').WikiPageData | null> {
    const raw = await this.readFile(relativePath);
    if (!raw) return null;
    const { data, content } = matter(raw);
    return {
      frontmatter: {
        title: data.title as string,
        created: data.created as string,
        updated: data.updated as string,
        confidence: (data.confidence as number) ?? 0.5,
        sources: (data.sources as string[]) ?? [],
        supersedes: (data.supersedes as string | null) ?? null,
        tags: (data.tags as string[]) ?? [],
      },
      content: content.trim(),
    };
  }

  async writeVerbatimEntry(entry: VerbatimEntry): Promise<void> {
    const data = entry.toData();
    const fm: Record<string, unknown> = {
      session: data.session,
      agent: data.agent,
      consolidated: data.consolidated,
      created: data.created,
    };
    if (data.project) fm.project = data.project;
    if (data.tags && data.tags.length > 0) fm.tags = data.tags;

    const content = matter.stringify('\n' + data.content + '\n', fm);
    await this.writeFile(entry.filePath, content);
  }
}
```

Note: `gray-matter` must also be added as a dependency to `@llm-wiki/infra`:

```bash
pnpm --filter @llm-wiki/infra add gray-matter
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/infra/tests/fs-file-store.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/infra/src/fs-file-store.ts packages/infra/tests/fs-file-store.test.ts packages/infra/package.json
git commit -m ":sparkles: [infra] FsFileStore adapter implementing IFileStore"
```

---

## Task 6: ConfigLoader and GitProjectResolver

**Files:**
- Create: `packages/infra/src/config-loader.ts`
- Create: `packages/infra/src/git-project-resolver.ts`
- Test: `packages/infra/tests/config-loader.test.ts`
- Test: `packages/infra/tests/git-project-resolver.test.ts`

- [ ] **Step 1: Write failing ConfigLoader tests**

```typescript
// packages/infra/tests/config-loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsFileStore } from '../src/fs-file-store.js';
import { ConfigLoader } from '../src/config-loader.js';

describe('ConfigLoader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cfg-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('test_load_sharedOnly_returnsDefaults', async () => {
    const store = new FsFileStore(tempDir);
    await store.writeFile('.config/settings.shared.yaml', 'consolidation:\n  batch_threshold: 10');

    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.consolidation.batch_threshold).toBe(10);
  });

  it('test_load_localOverridesShared', async () => {
    const store = new FsFileStore(tempDir);
    await store.writeFile('.config/settings.shared.yaml', 'consolidation:\n  batch_threshold: 10');
    await store.writeFile('.local/settings.local.yaml', 'llm:\n  model: gpt-4o');

    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.consolidation.batch_threshold).toBe(10);
    expect(config.llm.model).toBe('gpt-4o');
  });

  it('test_load_noFiles_returnsAllDefaults', async () => {
    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.sanitization.enabled).toBe(true);
    expect(config.sanitization.mode).toBe('redact');
  });

  it('test_load_envOverridesLocal', async () => {
    const store = new FsFileStore(tempDir);
    await store.writeFile('.local/settings.local.yaml', 'llm:\n  model: gpt-4o\n  api_key: yaml-key');

    process.env.LLM_WIKI_LLM_API_KEY = 'env-key';
    try {
      const loader = new ConfigLoader(tempDir);
      const config = await loader.load();

      expect(config.llm.model).toBe('gpt-4o'); // from yaml
      expect(config.llm.api_key).toBe('env-key'); // env overrides yaml
    } finally {
      delete process.env.LLM_WIKI_LLM_API_KEY;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/infra/tests/config-loader.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement ConfigLoader**

```typescript
// packages/infra/src/config-loader.ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

export interface WikiConfig {
  wiki: { path: string };
  llm: { provider: string; model: string; base_url: string | null; api_key: string | null };
  embedding: { provider: string; model: string; base_url: string | null; api_key: string | null };
  search: { db_path: string; rerank: boolean; cascade_threshold: number };
  git: { auto_commit: boolean; squash_on_lint: boolean; worktree_for_lint: boolean };
  consolidation: { batch_threshold: number; archive_after_days: number; archive_retention_months: number };
  sanitization: { enabled: boolean; mode: 'redact' | 'warn' | 'block'; custom_patterns: string[]; allowlist: string[] };
}

const DEFAULTS: WikiConfig = {
  wiki: { path: '~/.llm-wiki' },
  llm: { provider: 'openai', model: 'gpt-4o-mini', base_url: null, api_key: null },
  embedding: { provider: 'openai', model: 'text-embedding-3-small', base_url: null, api_key: null },
  search: { db_path: '.local/search.db', rerank: false, cascade_threshold: 0.3 },
  git: { auto_commit: true, squash_on_lint: true, worktree_for_lint: true },
  consolidation: { batch_threshold: 10, archive_after_days: 30, archive_retention_months: 6 },
  sanitization: { enabled: true, mode: 'redact', custom_patterns: [], allowlist: [] },
};

export class ConfigLoader {
  constructor(private readonly wikiRoot: string) {}

  async load(): Promise<WikiConfig> {
    const shared = await this.loadYaml('.config/settings.shared.yaml');
    const local = await this.loadYaml('.local/settings.local.yaml');
    const envOverrides = this.loadEnvOverrides();
    return this.deepMerge(DEFAULTS, shared, local, envOverrides) as WikiConfig;
  }

  private loadEnvOverrides(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const envMap: Record<string, [string, string]> = {
      LLM_WIKI_LLM_API_KEY: ['llm', 'api_key'],
      LLM_WIKI_LLM_MODEL: ['llm', 'model'],
      LLM_WIKI_LLM_BASE_URL: ['llm', 'base_url'],
      LLM_WIKI_EMBEDDING_API_KEY: ['embedding', 'api_key'],
      LLM_WIKI_EMBEDDING_MODEL: ['embedding', 'model'],
      LLM_WIKI_EMBEDDING_BASE_URL: ['embedding', 'base_url'],
      LLM_WIKI_PATH: ['wiki', 'path'],
    };

    for (const [envKey, [section, field]] of Object.entries(envMap)) {
      const value = process.env[envKey];
      if (value !== undefined) {
        if (!result[section]) result[section] = {};
        (result[section] as Record<string, unknown>)[field] = value;
      }
    }
    return result;
  }

  private async loadYaml(relativePath: string): Promise<Record<string, unknown>> {
    try {
      const content = await readFile(path.join(this.wikiRoot, relativePath), 'utf-8');
      return (yaml.load(content) as Record<string, unknown>) ?? {};
    } catch {
      return {};
    }
  }

  private deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value) &&
            result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = this.deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  }
}
```

- [ ] **Step 4: Run ConfigLoader tests**

Run: `pnpm vitest run packages/infra/tests/config-loader.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Write failing GitProjectResolver tests**

```typescript
// packages/infra/tests/git-project-resolver.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { GitProjectResolver } from '../src/git-project-resolver.js';
import { FsFileStore } from '../src/fs-file-store.js';

describe('GitProjectResolver', () => {
  let tempDir: string;
  let wikiDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-git-'));
    wikiDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-data-'));

    // Create a fake git repo with a remote
    execSync('git init', { cwd: tempDir });
    execSync('git remote add origin https://github.com/test/my-project.git', { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(wikiDir, { recursive: true, force: true });
  });

  it('test_resolve_knownProject_returnsName', async () => {
    const store = new FsFileStore(wikiDir);
    await store.writeFile(
      'projects/my-project/_config.md',
      '---\nname: my-project\ngit_remote: https://github.com/test/my-project.git\n---\n',
    );

    const resolver = new GitProjectResolver(store);
    const name = await resolver.resolve(tempDir);
    expect(name).toBe('my-project');
  });

  it('test_resolve_unknownProject_returnsNull', async () => {
    const store = new FsFileStore(wikiDir);
    const resolver = new GitProjectResolver(store);
    const name = await resolver.resolve(tempDir);
    expect(name).toBeNull();
  });

  it('test_resolve_notGitRepo_returnsNull', async () => {
    const nonGitDir = await mkdtemp(path.join(tmpdir(), 'non-git-fallback'));
    const store = new FsFileStore(wikiDir);
    // Create a project config matching the directory name
    await store.writeFile(
      'projects/non-git-fallback/_config.md',
      '---\nname: non-git-fallback\ngit_remote: ""\n---\n',
    );
    const resolver = new GitProjectResolver(store);
    const name = await resolver.resolve(nonGitDir);
    // Fallback: uses directory basename when not a git repo
    expect(name).toBe('non-git-fallback');
    await rm(nonGitDir, { recursive: true, force: true });
  });

  it('test_resolve_notGitRepo_noMatchingProject_returnsNull', async () => {
    const nonGitDir = await mkdtemp(path.join(tmpdir(), 'unknown-'));
    const store = new FsFileStore(wikiDir);
    const resolver = new GitProjectResolver(store);
    const name = await resolver.resolve(nonGitDir);
    expect(name).toBeNull();
    await rm(nonGitDir, { recursive: true, force: true });
  });

  it('test_getRemoteUrl_returnsOriginUrl', async () => {
    const store = new FsFileStore(wikiDir);
    const resolver = new GitProjectResolver(store);
    const url = await resolver.getRemoteUrl(tempDir);
    expect(url).toBe('https://github.com/test/my-project.git');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm vitest run packages/infra/tests/git-project-resolver.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement GitProjectResolver**

```typescript
// packages/infra/src/git-project-resolver.ts
import { execSync } from 'node:child_process';
import matter from 'gray-matter';
import type { IProjectResolver, IFileStore } from '@llm-wiki/core';

export class GitProjectResolver implements IProjectResolver {
  constructor(private readonly fileStore: IFileStore) {}

  async resolve(cwd: string): Promise<string | null> {
    const remoteUrl = await this.getRemoteUrl(cwd);

    // Scan all project configs to find matching remote or directory name
    const projects = await this.fileStore.listFiles('projects');
    for (const file of projects) {
      if (!file.path.endsWith('/_config.md')) continue;
      const content = await this.fileStore.readFile(file.path);
      if (!content) continue;
      const { data } = matter(content);

      // Match by git remote (primary)
      if (remoteUrl && data.git_remote === remoteUrl) {
        return data.name as string;
      }
    }

    // Fallback: match by directory basename when not a git repo
    if (!remoteUrl) {
      const dirName = cwd.split(/[/\\]/).filter(Boolean).pop();
      if (dirName) {
        const configExists = await this.fileStore.exists(`projects/${dirName}/_config.md`);
        if (configExists) return dirName;
      }
    }

    return null;
  }

  async getRemoteUrl(cwd: string): Promise<string | null> {
    try {
      const url = execSync('git remote get-url origin', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return url || null;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm vitest run packages/infra/tests/git-project-resolver.test.ts`
Expected: ALL PASS.

- [ ] **Step 9: Create infra index**

```typescript
// packages/infra/src/index.ts
export { FsFileStore } from './fs-file-store.js';
export { GitProjectResolver } from './git-project-resolver.js';
export { ConfigLoader } from './config-loader.js';
export type { WikiConfig } from './config-loader.js';
```

- [ ] **Step 10: Commit**

```bash
git add packages/infra/
git commit -m ":sparkles: [infra] ConfigLoader and GitProjectResolver adapters"
```

---

## Task 7: RememberService

**Files:**
- Create: `packages/core/src/services/remember-service.ts`
- Test: `packages/core/tests/services/remember-service.test.ts`

- [ ] **Step 1: Write failing tests (covers INV-1, INV-8)**

```typescript
// packages/core/tests/services/remember-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RememberService } from '../../src/services/remember-service.js';
import { SanitizationService } from '../../src/services/sanitization-service.js';
import type { IFileStore } from '../../src/ports/file-store.js';
import type { IVerbatimStore } from '../../src/ports/verbatim-store.js';

function createMocks() {
  const files = new Map<string, string>();

  const fileStore: IFileStore = {
    readFile: vi.fn(async (p: string) => files.get(p) ?? null),
    writeFile: vi.fn(async (p: string, c: string) => { files.set(p, c); }),
    listFiles: vi.fn(async () => []),
    exists: vi.fn(async (p: string) => files.has(p)),
    readWikiPage: vi.fn(async () => null),
  };

  const verbatimStore: IVerbatimStore = {
    writeEntry: vi.fn(async (entry: any) => {
      files.set(entry.filePath, `---\nsession: ${entry.sessionId}\nagent: ${entry.agent}\nconsolidated: false\n---\n${entry.content}`);
    }),
    listUnconsolidated: vi.fn(async () => []),
    countUnconsolidated: vi.fn(async () => 0),
  };

  return { fileStore, verbatimStore, files };
}

describe('RememberService', () => {
  let fileStore: IFileStore;
  let verbatimStore: IVerbatimStore;
  let service: RememberService;

  beforeEach(() => {
    const mocks = createMocks();
    fileStore = mocks.fileStore;
    verbatimStore = mocks.verbatimStore;
    const sanitizer = new SanitizationService({ enabled: true, mode: 'redact' });
    service = new RememberService(fileStore, verbatimStore, sanitizer);
  });

  it('test_rememberFact_validContent_writesFile', async () => {
    const result = await service.rememberFact({
      content: '- pgx pool MaxConns <= max_connections/3',
      agent: 'claude-code',
      sessionId: 'abc123',
      project: 'cli-relay',
    });

    expect(result.ok).toBe(true);
    expect(result.file).toMatch(/^log\/claude-code\/raw\//);
    expect(fileStore.writeVerbatimEntry).toHaveBeenCalledOnce();
  });

  it('test_rememberFact_emptyContent_throwsContentEmpty', async () => {
    await expect(
      service.rememberFact({ content: '', agent: 'claude-code', sessionId: 'abc' }),
    ).rejects.toThrow('CONTENT_EMPTY');
  });

  it('test_rememberFact_sensitiveContent_redacts', async () => {
    const result = await service.rememberFact({
      content: 'API key: sk-abc123def456ghi789jkl012mno345pqr678',
      agent: 'claude-code',
      sessionId: 'abc',
    });

    expect(result.ok).toBe(true);
    // writeVerbatimEntry receives the VerbatimEntry domain object with sanitized content
    const entry = (fileStore.writeVerbatimEntry as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entry.content).toContain('[REDACTED:api_key]');
    expect(entry.content).not.toContain('sk-abc123');
  });

  it('test_rememberFact_neverCallsLlm (INV-1)', async () => {
    // RememberService has no LLM dependency — this is structural
    const result = await service.rememberFact({
      content: 'fact',
      agent: 'test',
      sessionId: 'abc',
    });
    expect(result.ok).toBe(true);
    // If we got here without LLM, INV-1 is satisfied structurally
  });

  it('test_rememberSession_validSummary_writesFile', async () => {
    const result = await service.rememberSession({
      summary: '- Learned about connection pooling\n- Fixed migration bug',
      agent: 'claude-code',
      sessionId: 'session-1',
      project: 'cli-relay',
    });

    expect(result.ok).toBe(true);
    expect(result.facts_count).toBe(2);
    expect(fileStore.writeVerbatimEntry).toHaveBeenCalledOnce();
  });

  it('test_rememberSession_duplicateSessionId_returnsExisting (INV-8)', async () => {
    // First call
    const first = await service.rememberSession({
      summary: 'facts here',
      agent: 'claude-code',
      sessionId: 'dedup-session',
    });

    // Simulate that the file now exists (mock listFiles)
    (fileStore.listFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: first.file, updated: new Date().toISOString() },
    ]);
    (fileStore.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (p: string) => {
      if (p === first.file) return '---\nsession: dedup-session\nagent: claude-code\nconsolidated: false\n---\nfacts here';
      return null;
    });

    // Second call with same session_id but different summary
    const second = await service.rememberSession({
      summary: '- totally different\n- three lines\n- of content',
      agent: 'claude-code',
      sessionId: 'dedup-session',
    });

    expect(second.file).toBe(first.file);
    // facts_count should reflect STORED entry (1 fact), not new summary (3 facts)
    expect(second.facts_count).toBe(first.facts_count);
    // writeFile should have been called only once (for the first call)
    expect(fileStore.writeVerbatimEntry).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/tests/services/remember-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement RememberService**

```typescript
// packages/core/src/services/remember-service.ts
// No external dependencies — uses only domain entities and ports.
// Serialization to markdown is delegated to IVerbatimStore.writeEntry().
import { VerbatimEntry } from '../domain/verbatim-entry.js';
import { ContentEmptyError, SanitizationBlockedError } from '../domain/errors.js';
import type { IFileStore } from '../ports/file-store.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { SanitizationService } from './sanitization-service.js';

export interface RememberFactRequest {
  content: string;
  agent: string;
  sessionId: string;
  project?: string;
  tags?: string[];
}

export interface RememberFactResponse {
  ok: true;
  file: string;
  entry_id: string;
}

export interface RememberSessionRequest {
  summary: string;
  agent: string;
  sessionId: string;
  project?: string;
}

export interface RememberSessionResponse {
  ok: true;
  file: string;
  facts_count: number;
}

export class RememberService {
  constructor(
    private readonly fileStore: IFileStore,
    private readonly verbatimStore: IVerbatimStore,
    private readonly sanitizer: SanitizationService,
  ) {}

  async rememberFact(req: RememberFactRequest): Promise<RememberFactResponse> {
    if (!req.content.trim()) throw new ContentEmptyError();

    const sanitized = this.sanitizer.sanitize(req.content);
    if (sanitized.isBlocked) throw new SanitizationBlockedError(sanitized.redactedRatio);

    const entry = VerbatimEntry.create({
      content: sanitized.content,
      agent: req.agent,
      sessionId: req.sessionId,
      project: req.project,
      tags: req.tags,
    });

    await this.verbatimStore.writeEntry(entry);

    return { ok: true, file: entry.filePath, entry_id: entry.filename };
  }

  async rememberSession(req: RememberSessionRequest): Promise<RememberSessionResponse> {
    if (!req.summary.trim()) throw new ContentEmptyError();

    // Deduplication by session_id — return stored entry metadata, not new request data
    if (req.sessionId) {
      const existing = await this.findExistingSession(req.agent, req.sessionId);
      if (existing) {
        const storedContent = await this.fileStore.readFile(existing);
        const factsCount = storedContent ? this.countFacts(storedContent) : 1;
        return { ok: true, file: existing, facts_count: factsCount };
      }
    }

    const sanitized = this.sanitizer.sanitize(req.summary);
    if (sanitized.isBlocked) throw new SanitizationBlockedError(sanitized.redactedRatio);

    const entry = VerbatimEntry.create({
      content: sanitized.content,
      agent: req.agent,
      sessionId: req.sessionId,
      project: req.project,
    });

    await this.verbatimStore.writeEntry(entry);

    return {
      ok: true,
      file: entry.filePath,
      facts_count: this.countFacts(sanitized.content),
    };
  }

  private async findExistingSession(agent: string, sessionId: string): Promise<string | null> {
    const files = await this.fileStore.listFiles(`log/${agent}/raw`);
    for (const file of files) {
      if (!file.path.includes(sessionId)) continue;
      const content = await this.fileStore.readFile(file.path);
      if (!content) continue;
      // Parse session from frontmatter without gray-matter — simple string match
      const sessionMatch = content.match(/^session:\s*(.+)$/m);
      if (sessionMatch && sessionMatch[1].trim() === sessionId) return file.path;
    }
    return null;
  }

  private countFacts(content: string): number {
    return content.split('\n').filter(line => line.trim().startsWith('- ')).length || 1;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/tests/services/remember-service.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Update services index**

```typescript
// packages/core/src/services/index.ts
export { SanitizationService } from './sanitization-service.js';
export type { SanitizationConfig } from './sanitization-service.js';
export { RememberService } from './remember-service.js';
export type {
  RememberFactRequest,
  RememberFactResponse,
  RememberSessionRequest,
  RememberSessionResponse,
} from './remember-service.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/services/ packages/core/tests/services/remember-service.test.ts
git commit -m ":sparkles: [core] RememberService with sanitization (INV-1, INV-8)"
```

---

## Task 8: RecallService

**Files:**
- Create: `packages/core/src/services/recall-service.ts`
- Test: `packages/core/tests/services/recall-service.test.ts`

- [ ] **Step 1: Write failing tests (covers INV-2, INV-11, INV-12)**

```typescript
// packages/core/tests/services/recall-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecallService } from '../../src/services/recall-service.js';
import type { IFileStore, FileInfo } from '../../src/ports/file-store.js';
import type { IProjectResolver } from '../../src/ports/project-resolver.js';

function createMockFileStore(fileMap: Record<string, string> = {}): IFileStore {
  return {
    readFile: vi.fn(async (p: string) => fileMap[p] ?? null),
    writeFile: vi.fn(async () => {}),
    listFiles: vi.fn(async (dir: string): Promise<FileInfo[]> => {
      return Object.keys(fileMap)
        .filter(p => p.startsWith(dir + '/'))
        .map(p => {
          const content = fileMap[p];
          const match = content.match(/updated:\s*(.+)/);
          return { path: p, updated: match?.[1] ?? '2026-01-01' };
        })
        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    }),
    exists: vi.fn(async (p: string) => p in fileMap),
    readWikiPage: vi.fn(async (p: string) => {
      const raw = fileMap[p];
      if (!raw) return null;
      // Simple mock parser matching infra behavior
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!fmMatch) return null;
      const fm: Record<string, unknown> = {};
      for (const line of fmMatch[1].split('\n')) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim();
        let val: unknown = line.slice(idx + 1).trim();
        if (/^\d+(\.\d+)?$/.test(val as string)) val = Number(val);
        if (val === 'null') val = null;
        if ((val as string).startsWith?.('[')) val = (val as string).slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        fm[key] = val;
      }
      return {
        frontmatter: {
          title: fm.title as string, created: fm.created as string,
          updated: fm.updated as string, confidence: (fm.confidence as number) ?? 0.5,
          sources: (fm.sources as string[]) ?? [], supersedes: null, tags: (fm.tags as string[]) ?? [],
        },
        content: fmMatch[2].trim(),
      };
    }),
  };
}

function createMockResolver(projectName: string | null): IProjectResolver {
  return {
    resolve: vi.fn(async () => projectName),
    getRemoteUrl: vi.fn(async () => 'https://github.com/test/repo.git'),
  };
}

describe('RecallService', () => {
  it('test_recall_knownProject_returnsBothScopes', async () => {
    const files: Record<string, string> = {
      'projects/cli-relay/architecture.md': '---\ntitle: Architecture\nupdated: 2026-04-09\n---\n## Summary\nClean arch overview.',
      'projects/cli-relay/practices.md': '---\ntitle: Practices\nupdated: 2026-04-08\n---\n## Summary\nTesting practices.',
      'wiki/patterns/testing.md': '---\ntitle: Testing Patterns\nupdated: 2026-04-07\n---\n## Summary\nGeneral testing.',
    };
    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver('cli-relay');
    const verbatimStore = { writeEntry: vi.fn(), listUnconsolidated: vi.fn(async () => []), countUnconsolidated: vi.fn(async () => 3) };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/projects/cli-relay', max_tokens: 2048 });

    expect(result.project).toBe('cli-relay');
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    // Project pages should come first
    expect(result.pages[0].path).toContain('projects/cli-relay');
    // Wiki pages should also be present (30% reserved)
    const wikiPages = result.pages.filter(p => p.path.startsWith('wiki/'));
    expect(wikiPages.length).toBeGreaterThan(0);
  });

  it('test_recall_unknownProject_returnsWikiOnly_noError (INV-2)', async () => {
    const files: Record<string, string> = {
      'wiki/patterns/testing.md': '---\ntitle: Testing\nupdated: 2026-04-07\n---\n## Summary\nTesting info.',
    };
    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver(null);
    const verbatimStore = { writeEntry: vi.fn(), listUnconsolidated: vi.fn(async () => []), countUnconsolidated: vi.fn(async () => 3) };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/unknown/project' });

    expect(result.project).toBeNull();
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages[0].path).toContain('wiki/');
  });

  it('test_recall_deterministic_sameInput_sameOutput (INV-11)', async () => {
    const files: Record<string, string> = {
      'wiki/patterns/a.md': '---\ntitle: A\nupdated: 2026-04-09\n---\n## Summary\nPage A.',
      'wiki/patterns/b.md': '---\ntitle: B\nupdated: 2026-04-08\n---\n## Summary\nPage B.',
    };
    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver(null);
    const verbatimStore = { writeEntry: vi.fn(), listUnconsolidated: vi.fn(async () => []), countUnconsolidated: vi.fn(async () => 3) };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const first = await service.recall({ cwd: '/any' });
    const second = await service.recall({ cwd: '/any' });

    expect(first).toEqual(second);
  });

  it('test_recall_neverCallsLlm (INV-12)', async () => {
    // RecallService has no LLM dependency — structural guarantee.
    // Use non-empty wiki to avoid WIKI_EMPTY error.
    const fileStore = createMockFileStore({
      'wiki/patterns/test.md': '---\ntitle: Test\nupdated: 2026-04-01\n---\n## Summary\nTest page.',
    });
    const resolver = createMockResolver(null);
    const verbatimStore = { writeEntry: vi.fn(), listUnconsolidated: vi.fn(async () => []), countUnconsolidated: vi.fn(async () => 3) };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    // Resolves successfully — no LLM involved (structural: no ILlmClient in constructor)
    const result = await service.recall({ cwd: '/any' });
    expect(result.pages.length).toBeGreaterThan(0);
  });

  it('test_recall_emptyWiki_throwsWikiEmpty', async () => {
    const fileStore = createMockFileStore({});
    const resolver = createMockResolver(null);
    const verbatimStore = { writeEntry: vi.fn(), listUnconsolidated: vi.fn(async () => []), countUnconsolidated: vi.fn(async () => 3) };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    await expect(service.recall({ cwd: '/any' })).rejects.toThrow('WIKI_EMPTY');
  });

  it('test_recall_includesUnconsolidatedCount', async () => {
    // Non-empty wiki to avoid WIKI_EMPTY
    const fileStore = createMockFileStore({
      'wiki/concepts/one.md': '---\ntitle: One\nupdated: 2026-04-01\n---\n## Summary\nPage.',
    });
    const resolver = createMockResolver(null);
    const verbatimStore = { writeEntry: vi.fn(), listUnconsolidated: vi.fn(async () => []), countUnconsolidated: vi.fn(async () => 3) };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/any' });
    expect(result.unconsolidated_count).toBe(3);
  });

  it('test_recall_reservedBudget_wikiGetsMinimum30percent', async () => {
    // Create many project pages and few wiki pages
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      files[`projects/big/page${i}.md`] = `---\ntitle: Page ${i}\nupdated: 2026-04-${String(i + 1).padStart(2, '0')}\n---\n## Summary\n${'x'.repeat(100)}`;
    }
    files['wiki/patterns/important.md'] = '---\ntitle: Important\nupdated: 2026-01-01\n---\n## Summary\nCritical info.';

    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver('big');
    const verbatimStore = { writeEntry: vi.fn(), listUnconsolidated: vi.fn(async () => []), countUnconsolidated: vi.fn(async () => 3) };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/projects/big', max_tokens: 500 });

    const wikiPages = result.pages.filter(p => p.path.startsWith('wiki/'));
    expect(wikiPages.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/tests/services/recall-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement RecallService**

```typescript
// packages/core/src/services/recall-service.ts
import { WikiPage } from '../domain/wiki-page.js';
import { WikiEmptyError } from '../domain/errors.js';
import type { IFileStore } from '../ports/file-store.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { IProjectResolver } from '../ports/project-resolver.js';

export interface RecallRequest {
  cwd: string;
  max_tokens?: number;
}

export interface RecallPageInfo {
  path: string;
  title: string;
  summary: string;
  updated: string;
}

export interface RecallResponse {
  project: string | null;
  pages: RecallPageInfo[];
  unconsolidated_count: number;
  total_pages: number;
}

const DEFAULT_MAX_TOKENS = 2048;
const PROJECT_BUDGET_RATIO = 0.7;
const WIKI_BUDGET_RATIO = 0.3;
const APPROX_TOKENS_PER_PAGE = 50; // path + title + summary estimate

export class RecallService {
  constructor(
    private readonly fileStore: IFileStore,
    private readonly verbatimStore: IVerbatimStore,
    private readonly projectResolver: IProjectResolver,
  ) {}

  async recall(req: RecallRequest): Promise<RecallResponse> {
    const maxTokens = req.max_tokens ?? DEFAULT_MAX_TOKENS;
    const project = await this.projectResolver.resolve(req.cwd);

    const projectPages = project
      ? await this.loadPageInfos(`projects/${project}`)
      : [];

    const wikiPages = await this.loadPageInfos('wiki');

    if (projectPages.length === 0 && wikiPages.length === 0) {
      throw new WikiEmptyError();
    }

    // Budget allocation
    const totalBudget = Math.floor(maxTokens / APPROX_TOKENS_PER_PAGE);

    let projectBudget: number;
    let wikiBudget: number;

    if (project && projectPages.length > 0) {
      projectBudget = Math.floor(totalBudget * PROJECT_BUDGET_RATIO);
      wikiBudget = totalBudget - projectBudget;

      // If project doesn't use full budget, give remainder to wiki
      const actualProjectCount = Math.min(projectPages.length, projectBudget);
      const remainder = projectBudget - actualProjectCount;
      projectBudget = actualProjectCount;
      wikiBudget += remainder;
    } else {
      projectBudget = 0;
      wikiBudget = totalBudget;
    }

    const selectedProject = projectPages.slice(0, projectBudget);
    const selectedWiki = wikiPages.slice(0, wikiBudget);
    const pages = [...selectedProject, ...selectedWiki];

    const unconsolidatedCount = await this.verbatimStore.countUnconsolidated();

    return {
      project,
      pages,
      unconsolidated_count: unconsolidatedCount,
      total_pages: projectPages.length + wikiPages.length,
    };
  }

  private async loadPageInfos(directory: string): Promise<RecallPageInfo[]> {
    const files = await this.fileStore.listFiles(directory);
    const infos: RecallPageInfo[] = [];

    for (const file of files) {
      try {
        // Single parser path: IFileStore.readWikiPage uses gray-matter in infra
        const data = await this.fileStore.readWikiPage(file.path);
        if (!data) continue;

        const page = WikiPage.fromParsedData(file.path, data);
        infos.push({
          path: page.path,
          title: page.title,
          summary: page.summary,
          updated: page.updated,
        });
      } catch {
        // Skip malformed pages
      }
    }

    // Sort by frontmatter `updated` (not filesystem mtime) for deterministic ordering
    infos.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

    return infos;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/tests/services/recall-service.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Update services index**

```typescript
// packages/core/src/services/index.ts
export { SanitizationService } from './sanitization-service.js';
export type { SanitizationConfig } from './sanitization-service.js';
export { RememberService } from './remember-service.js';
export type {
  RememberFactRequest,
  RememberFactResponse,
  RememberSessionRequest,
  RememberSessionResponse,
} from './remember-service.js';
export { RecallService } from './recall-service.js';
export type { RecallRequest, RecallResponse, RecallPageInfo } from './recall-service.js';
```

- [ ] **Step 6: Run all tests**

Run: `pnpm vitest run`
Expected: ALL PASS across both packages.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/services/ packages/core/tests/services/recall-service.test.ts
git commit -m ":sparkles: [core] RecallService with deterministic 70/30 budget (INV-2, INV-11, INV-12)"
```

---

## Task 9: Integration test — end-to-end Remember + Recall

**Files:**
- Create: `packages/infra/tests/integration/remember-recall.test.ts`

- [ ] **Step 1: Write integration test with real filesystem**

```typescript
// packages/infra/tests/integration/remember-recall.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RememberService, RecallService, SanitizationService } from '@llm-wiki/core';
import { FsFileStore, GitProjectResolver } from '@llm-wiki/infra';

describe('Remember + Recall integration', () => {
  let wikiDir: string;
  let projectDir: string;
  let fileStore: FsFileStore;
  let rememberService: RememberService;
  let recallService: RecallService;

  beforeEach(async () => {
    wikiDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-int-'));
    projectDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-proj-'));

    // Init wiki structure
    fileStore = new FsFileStore(wikiDir);
    await fileStore.writeFile('schema.md', '# Schema\nRules here.');
    await fileStore.writeFile(
      'projects/test-project/_config.md',
      '---\nname: test-project\ngit_remote: https://github.com/test/repo.git\n---\n',
    );
    await fileStore.writeFile(
      'projects/test-project/architecture.md',
      '---\ntitle: Architecture\ncreated: 2026-04-09\nupdated: 2026-04-09\nconfidence: 0.8\nsources: []\nsupersedes: null\ntags: []\n---\n\n## Summary\n\nClean Architecture with ports/adapters.\n',
    );
    await fileStore.writeFile(
      'wiki/patterns/testing.md',
      '---\ntitle: Testing Patterns\ncreated: 2026-04-08\nupdated: 2026-04-08\nconfidence: 0.9\nsources: []\nsupersedes: null\ntags: [testing]\n---\n\n## Summary\n\nAlways use testcontainers.\n',
    );

    // Init git repo with remote
    execSync('git init', { cwd: projectDir });
    execSync('git remote add origin https://github.com/test/repo.git', { cwd: projectDir });

    const sanitizer = new SanitizationService({ enabled: true, mode: 'redact' });
    const resolver = new GitProjectResolver(fileStore);

    rememberService = new RememberService(fileStore, sanitizer);
    recallService = new RecallService(fileStore, resolver);
  });

  afterEach(async () => {
    await rm(wikiDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  it('test_remember_then_recall_seesUnconsolidatedCount', async () => {
    // Remember some facts
    await rememberService.rememberFact({
      content: '- pgx pool MaxConns <= max_connections/3',
      agent: 'claude-code',
      sessionId: 'test-session',
      project: 'test-project',
    });

    await rememberService.rememberFact({
      content: '- SQLC CTE bug workaround',
      agent: 'claude-code',
      sessionId: 'test-session',
      project: 'test-project',
    });

    // Recall should see the project context + unconsolidated count
    const result = await recallService.recall({ cwd: projectDir });

    expect(result.project).toBe('test-project');
    expect(result.unconsolidated_count).toBe(2);
    expect(result.pages.some(p => p.path.includes('architecture'))).toBe(true);
    expect(result.pages.some(p => p.path.includes('testing'))).toBe(true);
  });

  it('test_remember_sanitizes_before_writing', async () => {
    await rememberService.rememberFact({
      content: 'Found API key sk-abc123def456ghi789jkl012mno345pqr678 in config',
      agent: 'claude-code',
      sessionId: 'test-session',
    });

    // Read the written file directly
    const files = await fileStore.listFiles('log/claude-code/raw');
    expect(files).toHaveLength(1);

    const content = await fileStore.readFile(files[0].path);
    expect(content).toContain('[REDACTED:api_key]');
    expect(content).not.toContain('sk-abc123');
  });

  it('test_recall_deterministic_acrossMultipleCalls', async () => {
    const result1 = await recallService.recall({ cwd: projectDir });
    const result2 = await recallService.recall({ cwd: projectDir });
    expect(result1).toEqual(result2);
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `pnpm vitest run packages/infra/tests/integration/remember-recall.test.ts`
Expected: ALL PASS.

- [ ] **Step 3: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS across all packages.

Run: `pnpm lint`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/infra/tests/integration/
git commit -m ":white_check_mark: [test] Integration test: Remember + Recall end-to-end"
```

---

## Milestone 1 — Summary

After completing all 9 tasks, the following is delivered:

| Component | What it does |
|-----------|-------------|
| `@llm-wiki/core` domain | WikiPage, VerbatimEntry, Project, SanitizationResult entities |
| `@llm-wiki/core` ports | IFileStore, IProjectResolver, IVersionControl interfaces |
| `@llm-wiki/core` services | SanitizationService, RememberService, RecallService |
| `@llm-wiki/infra` | FsFileStore, GitProjectResolver, ConfigLoader adapters |
| Tests | Unit tests for domain + services, contract tests for adapters, integration test |

**Invariants verified:** INV-1, INV-2, INV-7, INV-8, INV-11, INV-12

**Next milestone:** Search + Query + Ingest (RuVector, AI SDK, SearchEngine, QueryService, IngestService, GitManager)
