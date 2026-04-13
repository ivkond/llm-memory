# Phase 4: CLI - Research

**Researched:** 2026-04-13
**Mode:** implementation

## Phase Goal

Build a command-line interface for all wiki operations (init, ingest, lint, import, search, status) so developers can perform wiki operations from the terminal without needing MCP.

## Standard Stack

- **CLI Framework:** Cliffy (cliffy) — native Deno heritage, mature for Node.js, excellent TypeScript support
  - Provides: Command parsing, subcommands, interactive prompts, colors, help generation
  - Why: Best fit for existing stack (pure TypeScript, ESM, Node 20+), avoids YAGNI additions
- **Colors:** cliffy built-in colors (no separate chalk needed)
- **XDG Base Directory:** `xdg-basedir` or custom implementation following XDG spec

## Architecture Patterns

### CLI Entry Point Pattern

```
packages/cli/
├── src/
│   ├── index.ts          # Main entry - llm-wiki command
│   ├── commands/
│   │   ├── init.ts       # llm-wiki init
│   │   ├── ingest.ts     # llm-wiki ingest <source>
│   │   ├── lint.ts       # llm-wiki lint [--phases]
│   │   ├── import.ts    # llm-wiki import
│   │   ├── search.ts    # llm-wiki search <query>
│   │   └── status.ts    # llm-wiki status
│   └── utils/
│       ├── config.ts    # Config loading (reuses ConfigLoader)
│       └── services.ts   # AppServices factory (reuses buildContainer)
├── package.json
└── tsconfig.json
```

### Command Structure (Cliffy)

```typescript
// Main entry - packages/cli/src/index.ts
#!/usr/bin/env node
import { Command } from 'cliffy';

await new Command()
  .name('llm-wiki')
  .description('CLI for LLM Wiki operations')
  .version('1.0.0')
  .command('init', ...).describe(...)
  .command('ingest', ...).describe(...)
  .command('lint', ...).describe(...)
  .command('import', ...).describe(...)
  .command('search', ...).describe(...)
  .command('status', ...).describe(...)
  .parse();
```

### Service Wiring Pattern

- CLI uses same `AppServices` from `@llm-wiki/common` as MCP server
- `buildContainer()` imported from `packages/common/src/build-container.ts`
- Config loading via `ConfigLoader` from `@llm-wiki/infra`

## Don't Hand-Roll

- **Command parsing:** Use Cliffy — provides subcommands, help, completions
- **Colors:** Cliffy built-in — no separate chalk needed
- **Config loading:** Reuse existing `ConfigLoader` from infra
- **Service container:** Reuse `@llm-wiki/common` buildContainer

## Common Pitfalls

1. **Interactive prompts in non-TTY:** Check `process.stdin.isTTY` before prompting; fail gracefully with helpful error
2. **XDG paths:** Handle missing env vars (`XDG_CONFIG_HOME`, `XDG_CACHE_HOME`) with sensible defaults
3. **Service initialization:** Handle missing wiki directory (run `init` first) vs existing wiki
4. **Error output:** Use `console.error` for errors, structured output for success (not mixed)

## Code Examples

### Cliffy Command with Options

```typescript
import { Command, Completions, CompletionsCommand } from 'cliffy';

await new Command()
  .name('llm-wiki')
  .version('1.0.0')
  .command('init', {
    describe: 'Initialize a new wiki',
    aliases: [],
    handler: () => {
      // Implementation
    },
  })
  .examples([
    {
      description: 'Initialize in current directory',
      command: 'llm-wiki init',
    },
  ])
  .parse();
```

### Interactive Prompt (Cliffy)

```typescript
import { prompt } from 'cliffy';

const { confirm } = await prompt([
  {
    type: 'confirm',
    name: 'confirm',
    message: 'Continue?',
    default: true,
  },
]);
```

### Service Initialization

```typescript
import { buildContainer } from '@llm-wiki/common';
import { ConfigLoader } from '@llm-wiki/infra';

const config = await ConfigLoader.load();
const services = await buildContainer(config);
```

## Validation Architecture

CLI validation requires:

1. **Exit codes:** 0 = success, 1 = error (standard)
2. **Output format:** Rich by default (colors, tables), no --json flag in v1
3. **Error messages:** Single line with helpful hint, not stack trace
4. **Health checks:** All commands validate wiki directory exists before operations

---

*Research for Phase 4: CLI*