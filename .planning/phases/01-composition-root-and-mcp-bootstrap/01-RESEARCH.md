# Phase 1: Composition Root and MCP Bootstrap - Research

**Researched:** 2026-04-12
**Domain:** Dependency injection composition root + MCP Streamable HTTP transport bootstrap
**Confidence:** MEDIUM-HIGH (стек и сервисы — HIGH; точный API `StreamableHTTPServerTransport` на node:http — MEDIUM, см. §Open Questions)

## Summary

Фаза собирает два новых workspace-пакета поверх существующих `@llm-wiki/core` / `@llm-wiki/infra`:

1. **`@llm-wiki/common`** — композиционный root. Экспортирует `buildContainer(config: WikiConfig): AppServices`, который инстанцирует все адаптеры инфраструктуры и внедряет их конструкторами в 8 доменных сервисов (Remember, Recall, Query, Ingest, Status, Lint, Import, Sanitization). Паттерн wiring'а уже отработан в `packages/infra/tests/integration/*.test.ts` — остаётся канонизировать.

2. **`@llm-wiki/mcp-server`** — тонкий транспорт. Поднимает HTTP-сервер на `node:http.createServer()`, маунтит `StreamableHTTPServerTransport` из `@modelcontextprotocol/sdk` (текущая стабильная ветка — `1.x`, последняя `1.29.0`), регистрирует ровно 7 инструментов (`wiki_query`, `wiki_recall`, `wiki_remember_fact`, `wiki_remember_session`, `wiki_ingest`, `wiki_lint`, `wiki_status`). В рамках этой фазы handler'ы — заглушки, бросающие `McpError(ErrorCode.InternalError, '<tool>: not_implemented (Phase 2/3)')`. Реальная логика приходит в фазах 2–3 без изменений schema и registry.

**Primary recommendation:** Пиннить `@modelcontextprotocol/sdk` на `^1.29.0` (v1 — рекомендуемая для production по словам maintainers; v2 в pre-alpha). Использовать **Zod** для inputSchema — он уже транзитивная зависимость SDK 1.x, хай-примеры SDK используют именно Zod, нулевой overhead. `StreamableHTTPServerTransport` сконфигурировать в **stateless-режиме** (`sessionIdGenerator: undefined`, `enableJsonResponse: true`) — solo use, multi-session не нужен.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Composition root — отдельный workspace-пакет `@llm-wiki/common` (директория `packages/common/`), экспортирует `buildContainer(config: WikiConfig): AppServices`. Depends on `@llm-wiki/core` + `@llm-wiki/infra`.
- **D-02:** `@llm-wiki/mcp-server` — новый тонкий workspace-пакет (`packages/mcp-server/`). `main.ts` (entry/bin) + `server.ts` + `tools/`. Никакой бизнес-логики — только маппинг MCP ↔ вызов сервиса; в этой фазе маппинг заглушен.
- **D-03:** HTTP-сервер — чистый `node:http.createServer()` + `StreamableHTTPServerTransport`. Никаких express/fastify.
- **D-04:** Порт/хост читаются через `ConfigLoader` — YAML (`mcp.port`, `mcp.host`) + env (`LLM_WIKI_MCP_PORT`, `LLM_WIKI_MCP_HOST`). Default host=`127.0.0.1`; port выбирает планировщик в 7000–9999.
- **D-05:** Регистрируются все 7 tools в Phase 1 с финальными schemas; handler'ы — stubs, бросающие `McpError`.
- **D-06:** Schemas выводятся из доменных request-типов. Ручные JSON Schema vs Zod — trade-off на усмотрение планировщика.

### Claude's Discretion

- Точный default port (7000–9999, не конфликтующий с known services).
- Реализация graceful shutdown (SIGINT/SIGTERM → close transport → `server.close()` → `exit(0)`, детали таймаутов/drain).
- Bin-имя (`llm-wiki-mcp` рекомендовано).
- Логирование: `console.error` достаточно; простой `logger.ts` допустим.
- Опциональный `/healthz`.
- Zod vs ручные JSON Schema для inputSchema.

### Deferred Ideas (OUT OF SCOPE)

- `/healthz` endpoint.
- pino / structured logging.
- Auth, CORS, TLS.
- Express/Fastify.
- MCP stdio transport (per PROJECT.md).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WIRE-01 | Single composition root instantiates all adapters and injects into services | §Composition Root (buildContainer map) + §Architecture Patterns |
| WIRE-02 | Configuration loaded via ConfigLoader (shared + local + env overrides) | §Config Extension — добавление `mcp.*` в WikiConfig + env overrides |
| MCP-01 | MCP server starts via HTTP (Streamable HTTP) and responds to tools/list | §MCP SDK API + §Streamable HTTP Wiring + §Tool Registration |

## Project Constraints (from CLAUDE.md / RULES.md)

Directives планировщик обязан соблюсти в плане:

- **TDD** — тесты первыми. Для Phase 1: integration-test поднимает сервер на ephemeral port → `tools/list` → assert 7 names + schemas; unit-тесты на `buildContainer` shape; unit на `McpError` stub-handlers. [CITED: CLAUDE.md]
- **Clean Architecture: Infra → App → Domain** — `@llm-wiki/common` и `@llm-wiki/mcp-server` живут слоем выше infra; они могут импортировать из `@llm-wiki/core` и `@llm-wiki/infra`, но `core` и `infra` НЕ должны импортировать из них. [CITED: CLAUDE.md]
- **ESM-only, NodeNext, `.js` расширения в relative imports, `verbatimModuleSyntax`** — обязательно `import type {...}` для типов. [VERIFIED: tsconfig.base.json]
- **Named exports only, barrel `index.ts`** — новые пакеты следуют. [CITED: CLAUDE.md Conventions]
- **No placeholders / TODO / `...`** — stub-handler'ы должны быть полноценной функцией с `throw new McpError(...)`, не `throw new Error('TODO')`. [CITED: RULES.md]
- **ISP ≤5 методов** — `AppServices` — это контейнер полей, не интерфейс-с-методами, правило не нарушается. [CITED: RULES.md]
- **SRP ≤300 строк на файл** — композиционный root естественно укладывается, но если `buildContainer` пухнет — разбить на per-layer builders (`buildInfra(config)`, `buildServices(infra)`). [CITED: RULES.md]
- **No new libs without explicit request** — единственный кандидат Zod; он уже транзитивная dep SDK 1.x (см. §Zod trade-off) → ОК. Всё остальное — `node:*`, `@modelcontextprotocol/sdk`. [CITED: CLAUDE.md]
- **Pre-commit hook отсутствует** — CLAUDE.md требует `.githooks/pre-commit` + `core.hooksPath`. Планировщик может включить создание хука как отдельную задачу или отложить; однако tsc -b всё равно запускается через `pnpm lint`. [VERIFIED: STACK section; .githooks/ отсутствует]
- **Test naming `test_<what>_<condition>_<result>`, AAA** — соблюдать. [VERIFIED: 27 существующих тест-файлов следуют].
- **Русский язык в ответах** — комментарии в коде — по существующей конвенции на английском (см. STACK/Observed). Ответы агента — по-русски.

## Standard Stack

### Core (новые зависимости)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `^1.29.0` | `McpServer`, `StreamableHTTPServerTransport`, `McpError`, `ErrorCode` | [VERIFIED: npm view] Официальный референс-SDK; v1.x — рекомендуется для production; v2 в pre-alpha, stable release ожидается Q1 2026. Уже заявлен в PROJECT.md constraints. |
| `zod` | `^3.25 \|\| ^4.0` | Input schemas для `registerTool` | [VERIFIED: npm view deps] Уже транзитивная зависимость `@modelcontextprotocol/sdk@1.29.0` (прямой `dependencies`), все официальные примеры `registerTool` используют Zod, SDK внутренне делает `zod-to-json-schema`. Нулевой install-cost. |

### Supporting (уже есть, переиспользовать)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@llm-wiki/core` | `workspace:*` | Сервисы + порты | Импорт из composition root и (косвенно) из transport |
| `@llm-wiki/infra` | `workspace:*` | Адаптеры + `ConfigLoader` + `WikiConfig` | Импорт **только** из composition root (`@llm-wiki/common`), не из `@llm-wiki/mcp-server` — сохраняет thin-transport инвариант |
| `node:http` | stdlib | HTTP listener | D-03 locked |
| `vitest` | `^3.1.0` | Тесты | [VERIFIED: root devDependencies] Workspace config уже есть, расширить `vitest.workspace.ts` на новые пакеты |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:http` | `express` / `fastify` | [OUT] Deferred per CONTEXT.md — добавляет dep и middleware surface, не нужен для solo |
| Zod для schemas | Hand-written JSON Schema objects | Zod: runtime-валидация + авто-JSON-Schema через SDK, используется в официальных примерах. Hand-written: 0 новых deps, но Zod уже транзитивно в SDK 1.29.0 → выигрыша нет. **Рекомендация: Zod** (но планировщик волен выбрать). |
| Zod как top-level dep | Полагаться на транзитивную | Явная top-level dep = предсказуемая версия + `pnpm` не выдаст warning. **Рекомендация: добавить явно** `zod` в `@llm-wiki/mcp-server/package.json`. |
| stateful session mode | `sessionIdGenerator: () => randomUUID()` | Solo use не требует сессий; stateful добавляет complexity (session store, cleanup). Stateless `sessionIdGenerator: undefined` + `enableJsonResponse: true` — проще и соответствует scope. |

**Installation (в `packages/mcp-server/package.json`):**

```bash
pnpm --filter @llm-wiki/mcp-server add @modelcontextprotocol/sdk@^1.29.0 zod@^3.25
pnpm --filter @llm-wiki/mcp-server add -D @types/node@^22 typescript@^5.8 vitest@^3.1
```

**Version verification:**

```bash
npm view @modelcontextprotocol/sdk version time.1.29.0
# [VERIFIED 2026-04-12] version = '1.29.0', published 2026-03-30.
```

## Architecture Patterns

### Recommended Project Structure

```
packages/
├── core/                      # existing
├── infra/                     # existing
├── common/                    # NEW — composition root
│   ├── package.json           # name=@llm-wiki/common, deps core+infra workspace:*
│   ├── tsconfig.json          # composite, references ../core, ../infra
│   ├── vitest.config.ts       # aliases to src for core/infra/common
│   └── src/
│       ├── index.ts           # barrel: export buildContainer, AppServices
│       ├── build-container.ts # buildContainer(config: WikiConfig): AppServices
│       ├── build-infra.ts     # optional split — keeps files <300 LOC
│       └── app-services.ts    # interface AppServices { remember, recall, query, ingest, status, lint, import_ }
│   └── tests/
│       └── build-container.test.ts
└── mcp-server/                # NEW — thin transport
    ├── package.json           # bin: { "llm-wiki-mcp": "./dist/main.js" }
    ├── tsconfig.json          # composite, references ../common
    ├── vitest.config.ts       # aliases
    └── src/
        ├── index.ts           # barrel (exports startServer for programmatic use)
        ├── main.ts            # #!/usr/bin/env node — CLI entry, reads WIKI_ROOT env/argv
        ├── server.ts          # startServer(services, { host, port }): { close(): Promise<void> }
        ├── tools/
        │   ├── index.ts       # registerAllTools(server: McpServer, services: AppServices): void
        │   ├── schemas.ts     # Zod input schemas (one per tool) derived from domain request types
        │   ├── wiki-query.ts  # stub handler — throws McpError not_implemented
        │   ├── wiki-recall.ts
        │   ├── wiki-remember-fact.ts
        │   ├── wiki-remember-session.ts
        │   ├── wiki-ingest.ts
        │   ├── wiki-lint.ts
        │   └── wiki-status.ts
        └── logger.ts          # optional: console.error wrapper
    └── tests/
        ├── server.integration.test.ts   # spin up on ephemeral port, POST tools/list, assert 7 names
        └── tools/stubs.test.ts          # each handler throws McpError('...not_implemented')
```

### Pattern 1: Composition Root (buildContainer)

**What:** Один чистый файл, который принимает `WikiConfig` и возвращает готовые к использованию сервисы. Никакого DI-контейнера — прямая конструкторная инъекция (соответствует существующему стилю codebase).

**When to use:** Всегда, когда нужно получить экземпляр `AppServices` (MCP-server, будущий CLI, тесты-sanity).

**Example (shape):**

```typescript
// Source: адаптировано из packages/infra/tests/integration/ingest-e2e.test.ts + существующих конструкторов сервисов.
import {
  FsFileStore, FsVerbatimStore, GitProjectResolver, GitVersionControl,
  RuVectorSearchEngine, AiSdkLlmClient, AiSdkEmbeddingClient,
  YamlStateStore, FsSourceReader, HttpSourceReader, CompositeSourceReader,
  SevenZipArchiver, ClaudeCodeMemoryReader,
  type WikiConfig,
} from '@llm-wiki/infra';
import {
  RememberService, RecallService, QueryService, IngestService,
  WikiStatusService, LintService, ImportService, SanitizationService,
} from '@llm-wiki/core';
import { openai } from '@ai-sdk/openai';
import { createOpenAI } from '@ai-sdk/openai';
import path from 'node:path';
import { homedir } from 'node:os';

export interface AppServices {
  readonly remember: RememberService;
  readonly recall: RecallService;
  readonly query: QueryService;
  readonly ingest: IngestService;
  readonly status: WikiStatusService;
  readonly lint: LintService;
  readonly import_: ImportService;
}

export function buildContainer(config: WikiConfig): AppServices {
  const wikiRoot = expandHome(config.wiki.path);

  // --- Leaf infra (stateless or self-contained) ---
  const fileStore = new FsFileStore(wikiRoot);
  const verbatimStore = new FsVerbatimStore(fileStore);           // <-- verify ctor
  const projectResolver = new GitProjectResolver(wikiRoot);
  const versionControl = new GitVersionControl(wikiRoot);
  const stateStore = new YamlStateStore(fileStore);
  const sourceReader = new CompositeSourceReader([
    new FsSourceReader(),
    new HttpSourceReader(),
  ]);

  // --- LLM / embeddings (provider via config) ---
  const llmProvider = createOpenAI({
    apiKey: config.llm.api_key ?? undefined,
    baseURL: config.llm.base_url ?? undefined,
  });
  const llmClient = new AiSdkLlmClient(llmProvider(config.llm.model));

  const embProvider = createOpenAI({
    apiKey: config.embedding.api_key ?? undefined,
    baseURL: config.embedding.base_url ?? undefined,
  });
  const embeddingClient = new AiSdkEmbeddingClient(
    embProvider.textEmbeddingModel(config.embedding.model),
    /* dims */ 1536,  // planner: derive from model or add config.embedding.dims
  );

  // --- Search engine (depends on embeddings) ---
  const searchDbPath = path.resolve(wikiRoot, config.search.db_path);
  const searchEngine = new RuVectorSearchEngine(searchDbPath, embeddingClient);

  // --- Sanitization (one concrete service, not a port) ---
  const sanitizer = new SanitizationService({
    enabled: config.sanitization.enabled,
    mode: config.sanitization.mode,
    customPatterns: config.sanitization.custom_patterns,
    allowlist: config.sanitization.allowlist,
  });

  // --- FileStoreFactory (required by IngestService/LintService) ---
  const fileStoreFactory = (rootDir: string) => new FsFileStore(rootDir);
  const verbatimStoreFactory = (fs: IFileStore) => new FsVerbatimStore(fs);

  // --- Services (pure constructor injection) ---
  const remember = new RememberService(fileStore, verbatimStore, sanitizer);
  const recall = new RecallService(fileStore, verbatimStore, projectResolver);
  const query = new QueryService(searchEngine, llmClient, projectResolver, fileStore);
  const status = new WikiStatusService(fileStore, verbatimStore, searchEngine, stateStore);
  const ingest = new IngestService(
    sourceReader, llmClient, searchEngine, versionControl,
    fileStore, fileStoreFactory, stateStore,
  );
  const lint = new LintService({
    mainRepoRoot: wikiRoot,
    mainFileStore: fileStore,
    mainVerbatimStore: verbatimStore,
    versionControl,
    fileStoreFactory,
    verbatimStoreFactory,
    llmClient,
    // archiver, searchEngine, now, etc — см. LintServiceDeps
  });
  const import_ = new ImportService({
    // планировщик: собрать ImportServiceDeps по import-service.ts сигнатуре.
    // Агенты читаются из config — в M3 один адаптер: ClaudeCodeMemoryReader.
    stateStore,
    verbatimStore,
    fileStore,
    readers: { 'claude-code': new ClaudeCodeMemoryReader(/*...*/) },
    // ...
  });

  return Object.freeze({ remember, recall, query, ingest, status, lint, import_ });
}

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(homedir(), p.slice(1)) : p;
}
```

**Примечание:** Точные конструкторы `LintService` / `ImportService` сложнее (deps-object). Планировщик должен свериться с `packages/core/src/services/lint-service.ts` (`LintServiceDeps`) и `import-service.ts` (`ImportServiceDeps`). Сервисные конструкторы проверены — см. §Service Constructor Map ниже.

### Pattern 2: MCP Server Bootstrap (Streamable HTTP, stateless)

**What:** Минимальный `node:http` сервер, на каждый POST `/mcp` создающий (или переиспользующий, см. ниже) `StreamableHTTPServerTransport` в stateless режиме и делегирующий запрос через `transport.handleRequest(req, res, parsedBody)`. [CITED: Smithery docs + SDK examples directory listing, https://github.com/modelcontextprotocol/typescript-sdk/tree/main/examples/server]

**When to use:** MCP-server entry point.

**Example (shape, адаптирован из официального `simpleStatelessStreamableHttp.ts` + `server.md`):**

```typescript
// Source (pattern): https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/server/README.md
// Key point: в stateless режиме создаём НОВЫЙ transport + НОВЫЙ McpServer per request
// (см. Issue #360 — единый instance ломает concurrent clients).
// [VERIFIED via WebSearch 2026-04-12: "In stateless mode, create a new instance of transport and server for each request to ensure complete isolation"]
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AppServices } from '@llm-wiki/common';
import { registerAllTools } from './tools/index.js';

export interface ServerHandle {
  readonly url: string;     // e.g. "http://127.0.0.1:7849"
  close(): Promise<void>;
}

export async function startServer(
  services: AppServices,
  opts: { host: string; port: number },
): Promise<ServerHandle> {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/mcp') {
      try {
        const body = await readJson(req);  // read + JSON.parse
        const mcp = new McpServer({ name: 'llm-wiki', version: '0.1.0' });
        registerAllTools(mcp, services);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,   // stateless
          enableJsonResponse: true,        // JSON, not SSE
        });
        res.on('close', () => { void transport.close(); void mcp.close(); });
        await mcp.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: String(err) } }));
        }
      }
      return;
    }
    // 405 for GET/DELETE /mcp + 404 elsewhere
    res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method Not Allowed' }, id: null }));
  });

  await new Promise<void>((resolve) => httpServer.listen(opts.port, opts.host, resolve));
  const { port, address } = httpServer.address() as import('node:net').AddressInfo;

  return {
    url: `http://${address}:${port}`,
    close: () => new Promise<void>((resolve, reject) =>
      httpServer.close((err) => (err ? reject(err) : resolve())),
    ),
  };
}
```

### Pattern 3: Tool Registration (Zod schemas + stub handlers)

```typescript
// Source (pattern): https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md registerTool example
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { AppServices } from '@llm-wiki/common';

const rememberFactSchema = z.object({
  content: z.string().min(1),
  agent: z.string().min(1),
  sessionId: z.string().min(1),
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export function registerAllTools(server: McpServer, _services: AppServices): void {
  server.registerTool(
    'wiki_remember_fact',
    {
      title: 'Remember Fact',
      description: 'Store a sanitized verbatim fact in the wiki.',
      inputSchema: rememberFactSchema,
    },
    async () => {
      throw new McpError(
        ErrorCode.InternalError,
        'wiki_remember_fact: not_implemented (Phase 3)',
      );
    },
  );
  // ... 6 ещё
}
```

### Anti-Patterns to Avoid

- **Единый глобальный `McpServer` + `StreamableHTTPServerTransport` для всех запросов в stateless-режиме.** Официально известный issue: "request ID collisions when multiple clients connect concurrently". Fix: per-request instance. [CITED: WebSearch результаты 2026-04-12, SDK issue #360]
- **Импорт `@llm-wiki/infra` напрямую из `@llm-wiki/mcp-server`.** Нарушает CONTEXT.md D-01 (thin-transport). Транспорт импортит только `@llm-wiki/common` + `@modelcontextprotocol/sdk`.
- **`JSON.parse(req)` на streaming request без await'а.** Читать body нужно корректно (collect `data` chunks или использовать `raw-body`, которое уже транзитивная dep SDK).
- **Использование `console.log` в production-коде.** RULES.md: `console.*` запрещены в src; `console.error` в точке входа (`main.ts`) допустим для stderr-логов.
- **Не использовать `export default`.** RULES.md: named exports only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-RPC 2.0 dispatch | Собственный роутер | `McpServer.registerTool` + `transport.handleRequest` | SDK реализует spec, включая initialize handshake, capabilities, tools/list, tools/call, notifications |
| Input schema validation | Самописный validator | Zod (транзитивно в SDK) | SDK сам валидирует через переданную Zod-схему, конвертит в JSON Schema для tools/list |
| MCP wire errors | Свой error class | `McpError` + `ErrorCode` из `@modelcontextprotocol/sdk/types.js` | Правильные JSON-RPC коды (-32xxx), гарантированный формат |
| Session management | Свой session store | `sessionIdGenerator: undefined` (stateless) ИЛИ встроенный (stateful, не нужен для solo) | |
| HTTP body parsing | Свой raw-body collector | Либо `raw-body` (уже в SDK deps) либо `for await (const chunk of req)` + `JSON.parse` | Для node:http достаточно простого helper'а — minisurface |
| DI container | inversify / tsyringe | Прямая конструкторная инъекция в `buildContainer` | RULES.md DI style: "No DI container. Wiring lives at the composition root" — существующая конвенция |

**Key insight:** весь MCP-протокольный слой — в SDK. Наш код — тонкая glue на ~50–100 LOC в `server.ts` плюс 7 tool-регистраций.

## Service Constructor Map

[VERIFIED via grep packages/core/src/services 2026-04-12] Точные сигнатуры, которые должен построить `buildContainer`:

| Service | Constructor (positional, порядок существенен) |
|---------|------------------------------------------------|
| `SanitizationService` | `(config: SanitizationConfig)` |
| `RememberService` | `(fileStore, verbatimStore, sanitizer: SanitizationService)` |
| `RecallService` | `(fileStore, verbatimStore, projectResolver)` |
| `QueryService` | `(searchEngine, llmClient, projectResolver, fileStore)` |
| `WikiStatusService` | `(fileStore, verbatimStore, searchEngine, stateStore)` |
| `IngestService` | `(sourceReader, llmClient, searchEngine, versionControl, mainFileStore, fileStoreFactory, stateStore)` |
| `LintService` | `(deps: LintServiceDeps)` — объект с `mainRepoRoot`, `mainFileStore`, `mainVerbatimStore`, `versionControl`, `fileStoreFactory`, `verbatimStoreFactory`, `llmClient`, и опционально `now` |
| `ImportService` | `(deps: ImportServiceDeps)` — `stateStore`, `now?`, `idGenerator?`, и читатели агентов; планировщик сверит с `import-service.ts` |

**Gap:** сигнатура `ImportServiceDeps` требует открыть `packages/core/src/services/import-service.ts:30-40` — планировщик это сделает при составлении tasks. Я прочитал ctor и знаю, что поля группируются в объект; полный набор полей в этом RESEARCH.md не перечислен.

## Config Extension (WikiConfig + env overrides)

[VERIFIED: packages/infra/src/config-loader.ts] Текущий `WikiConfig` НЕ содержит `mcp.*`. Расширение:

```typescript
export interface WikiConfig {
  // ... existing
  mcp: { host: string; port: number };
}

const DEFAULTS: WikiConfig = {
  // ...
  mcp: { host: '127.0.0.1', port: 7849 /* планировщик выберет */ },
};
```

Env overrides (добавить в `envMap`):

```typescript
LLM_WIKI_MCP_HOST: ['mcp', 'host'],
LLM_WIKI_MCP_PORT: ['mcp', 'port'],   // note: string → number, см. ниже
```

**Caveat:** `loadEnvOverrides` сейчас кладёт значения как string. Для `port` нужно либо парсить `Number(value)` в `envMap` handler'е (легкая доработка — требует изменения внутренней сигнатуры `envMap`), либо делать `Number(config.mcp.port)` в `startServer`. **Рекомендация:** парсить в `ConfigLoader` при merge — иначе типизация `WikiConfig.mcp.port: number` — ложь. [ASSUMED] Оба варианта корректны; планировщик выберет.

**Port default — выбор значения:** [ASSUMED] Предлагаю **`7849`** — не занято IANA, вне диапазонов npm/node-inspector (9229), vite (5173), k8s (6443), common dev ports (3000, 4000, 5000, 8000, 8080). Планировщик может выбрать другой в 7000–9999.

## MCP SDK API Surface (verified against v1.29.0)

[VERIFIED via WebFetch of https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md и npm registry 2026-04-12]

### McpServer

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
const server = new McpServer({ name: 'llm-wiki', version: '0.1.0' });
```

### registerTool

```typescript
server.registerTool(
  'tool-name',
  {
    title: 'Human-readable title',
    description: 'What the tool does',
    inputSchema: z.object({ /* Zod schema */ }),
    // outputSchema: z.object({...}) // optional; if set, handler должен вернуть structuredContent
  },
  async (args, _extra) => {
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      // structuredContent: result,   // if outputSchema set
      // isError: true                 // для error-case БЕЗ throw
    };
  },
);
```

### StreamableHTTPServerTransport

```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,        // stateless mode
  enableJsonResponse: true,             // JSON instead of SSE (simpler for req/resp)
  // eventStore: ...,                    // only for stateful resumability
});

await server.connect(transport);
await transport.handleRequest(req, res, parsedBody);
// transport.close() — closes SSE streams; "in-flight tool handlers are NOT automatically drained" [CITED: docs/server.md]
```

### McpError + ErrorCode

```typescript
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
throw new McpError(ErrorCode.InternalError, 'wiki_xxx: not_implemented (Phase 2/3)');
```

**ErrorCode enum values** [ASSUMED based on JSON-RPC 2.0 spec + SDK convention, NOT verified verbatim from SDK source — планировщик должен подтвердить через `import` + IDE или открыв `node_modules/@modelcontextprotocol/sdk/dist/types.d.ts` после установки]:

| Name | Numeric | Use |
|------|---------|-----|
| `ParseError` | -32700 | Invalid JSON |
| `InvalidRequest` | -32600 | Not a valid JSON-RPC request |
| `MethodNotFound` | -32601 | Unknown method (≠ unknown tool) |
| `InvalidParams` | -32602 | Bad params |
| `InternalError` | -32603 | Generic server error — **use for stub handlers** |

Нет отдельного `NotImplemented` code — `InternalError` с понятным message — канонический выбор. [ASSUMED]

## Streamable HTTP Wiring — детали

### Stateless mode — канонический flow

1. Клиент шлёт `POST /mcp` с JSON-RPC payload (`initialize`, `tools/list`, или `tools/call`).
2. Наш handler: читает body, создаёт **новую пару `McpServer` + `StreamableHTTPServerTransport` на каждый запрос**, регистрирует все 7 tools (они дешёвые — просто `server.registerTool(...)`), вызывает `await server.connect(transport)` → `await transport.handleRequest(req, res, body)`.
3. SDK отвечает JSON (т.к. `enableJsonResponse: true`), закрывает поток.
4. По `res.on('close')` — `transport.close()` + `server.close()` для гигиены.

[CITED: WebSearch 2026-04-12 "typescript-sdk issue #360"] Stateless mode требует per-request instance — единый shared экземпляр ломается при concurrent clients.

### Альтернатива — stateful с сессией

Не нужна для solo. Deferred.

### GET /mcp (SSE notifications)

В stateless + JSON-only режиме **не нужен**. Можно отвечать 405 Method Not Allowed, как делает `simpleStatelessStreamableHttp.ts` из examples. [VERIFIED: WebFetch examples/server/README.md description]

## Graceful Shutdown

**Pattern:**

```typescript
// main.ts
const handle = await startServer(services, { host, port });
console.error(`[llm-wiki-mcp] listening on ${handle.url}`);

const shutdown = async (signal: string) => {
  console.error(`[llm-wiki-mcp] ${signal} received, shutting down...`);
  try {
    await handle.close();   // stop accepting new connections + wait for in-flight to finish
    process.exit(0);
  } catch (err) {
    console.error('[llm-wiki-mcp] shutdown error:', err);
    process.exit(1);
  }
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
```

**Pitfalls** [CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md]:

- `transport.close()` закрывает SSE-стримы, но **не дрейнит in-flight tool handlers**. В Phase 1 stub-handler'ы бросают сразу → нет in-flight работы → ОК. В Phase 2/3 (долгие ingest/lint) — потребуется task-level cancellation.
- `httpServer.close()` ждёт, пока активные соединения закроются. Добавить таймаут через `setTimeout(() => process.exit(1), 10_000)` — защита от зависания. [ASSUMED]

## Tool Input Schemas (derived from domain request types)

[VERIFIED: packages/core/src/services/*.ts export interfaces] Ниже — field map для Phase 1 schemas. Tool handlers в Phase 1 всё равно throw'ают, но schemas уже финальные — Phase 2/3 подключат вызов без их изменения.

| Tool | Input fields (из доменного request типа) |
|------|------------------------------------------|
| `wiki_query` | `question: string` (required), `scope?: string`, `project?: string`, `cwd?: string`, `maxResults?: number` |
| `wiki_recall` | `cwd: string` (required), `max_tokens?: number` |
| `wiki_remember_fact` | `content: string`, `agent: string`, `sessionId: string`, `project?: string`, `tags?: string[]` |
| `wiki_remember_session` | `summary: string`, `agent: string`, `sessionId: string`, `project?: string` |
| `wiki_ingest` | `source: string`, `hint?: string` |
| `wiki_lint` | `phases?: ('consolidate' \| 'promote' \| 'health')[]` ([VERIFIED from lint-service.ts LintPhaseName]) |
| `wiki_status` | `{}` (WikiStatusService.status() takes no request) |

**Note:** `cwd` в `wiki_query`/`wiki_recall` — это cwd агента-клиента, не сервера. Клиент (Claude Code) передаёт его явно. [ASSUMED]

## Common Pitfalls

### Pitfall 1: Shared transport instance in stateless mode
**What goes wrong:** concurrent requests ломают response routing, request ID collisions.
**Why:** `StreamableHTTPServerTransport` в stateless ожидает 1:1 с запросом; внутренний state (pending requests) cross-пересекается.
**How to avoid:** new transport + new McpServer per request.
**Warning signs:** Second concurrent client получает чужой ответ или "Bad Request: Server not initialized".
**Source:** [CITED: GitHub issues #340, #360, #412 found via WebSearch]

### Pitfall 2: SDK entry points — путь в импорте
**What:** SDK экспортирует несколько подпутей (`/server/mcp.js`, `/server/streamableHttp.js`, `/types.js`). Прямой `import { McpServer } from '@modelcontextprotocol/sdk'` не работает — нужен глубокий import.
**How to avoid:** явно `/server/mcp.js` и `/server/streamableHttp.js` и `/types.js`. [ASSUMED based on SDK package.json exports convention, verify during implementation]

### Pitfall 3: verbatimModuleSyntax ломает mixed imports
**What:** `import { McpError } from '.../types.js'` — ОК; но если пытаться `import { McpError, type ErrorCode }` в одном statement — TS2205. Под `verbatimModuleSyntax: true` — каждый type-only member требует `import type`.
**How to avoid:** раздельные import'ы. [VERIFIED: tsconfig.base.json]

### Pitfall 4: ESM .js extensions
**What:** `import { buildContainer } from './build-container'` — fail в NodeNext.
**How to avoid:** всегда `.js` в relative imports (даже в `.ts` source). [VERIFIED: codebase-wide convention]

### Pitfall 5: Port conflicts
**What:** default port занят другим процессом (dev server etc).
**How to avoid:** дефолт 7849, явный error с hint в logs, env override `LLM_WIKI_MCP_PORT`.

### Pitfall 6: Vitest aliases должны покрыть новые пакеты
**What:** `packages/infra/vitest.config.ts` алиасит `@llm-wiki/core` → source. Новые пакеты должны делать то же для `@llm-wiki/common` (иначе тесты бьют в несуществующий `dist/`).
**How to avoid:** копипаста паттерна алиасов из `packages/infra/vitest.config.ts`.

## Code Examples

См. §Architecture Patterns Pattern 1–3 выше.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP stdio-only + HTTP+SSE (два отдельных транспорта) | Streamable HTTP (единый HTTP endpoint, optional SSE) | MCP spec 2025-03 | Один endpoint, session-less или session-full на выбор. [CITED: PROJECT.md constraint]. |
| SDK v2 pre-alpha | v1.x рекомендуется для production | v2 stable: Q1 2026 (in progress, not yet) | [CITED: typescript-sdk README main] Пиннить v1.x. |

**Deprecated/outdated:**
- MCP stdio transport — out of scope per PROJECT.md (не deprecated в SDK, просто не для этого проекта).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Точные значения `ErrorCode` enum (`InternalError = -32603` etc) | §MCP SDK API Surface | Низкий. Верифицируется в 1 команду (`tsc + IDE hover`). Используем `ErrorCode.InternalError` — имя, не число. |
| A2 | `@modelcontextprotocol/sdk/types.js` — правильный subpath для `McpError` / `ErrorCode` | §MCP SDK API Surface | Средний. Если subpath другой — импорт не скомпилируется, обнаруживается сразу. Альтернатива: `/types` или из корня. |
| A3 | Default port `7849` не конфликтует у пользователя | §Config Extension | Низкий. Переопределяется env. |
| A4 | Конвертация string→number для `LLM_WIKI_MCP_PORT` делается в ConfigLoader, а не в startServer | §Config Extension | Низкий. Оба варианта корректны. |
| A5 | `ImportServiceDeps` полный набор полей | §Service Constructor Map | Средний. Планировщик сверится с import-service.ts:30-40 при написании плана. |
| A6 | `AiSdkEmbeddingClient` принимает dims=1536 как константу; новая опция `config.embedding.dims` не требуется | §buildContainer | Низкий-средний. Существующие e2e-тесты передают dims явно — значит ctor это требует. Планировщик проверит. |
| A7 | `cwd` в wiki_query/wiki_recall schemas — это cwd клиента, не сервера | §Tool Input Schemas | Низкий. Очевидно из semantic, но нужна документация в description поле tool'а. |
| A8 | `NotImplemented` отдельного ErrorCode нет — используем `InternalError` | §MCP SDK API | Низкий. Это канонический выбор по JSON-RPC 2.0. |
| A9 | `McpServer.close()` / `transport.close()` идемпотентны | §Graceful Shutdown | Низкий. Standard SDK convention. |
| A10 | В stateless mode per-request instance — обязателен (не опциональная оптимизация) | §Streamable HTTP Wiring | Средний. [CITED] результаты поиска говорят именно так — issue #360. Планировщик подтвердит при имплементации. |

## Open Questions

1. **`StreamableHTTPServerTransport` constructor options — точный тип**
   - What we know: поддерживает `sessionIdGenerator`, `enableJsonResponse`, `eventStore`; stateless = `sessionIdGenerator: undefined`.
   - What's unclear: есть ли `allowedOrigins` (CORS) или `dnsRebindingProtection` флаги в v1.29.0 — deferred scope (solo use, 127.0.0.1).
   - Recommendation: Открыть `node_modules/@modelcontextprotocol/sdk/dist/server/streamableHttp.d.ts` после install — 1 минута. Планировщик решит, нужны ли дополнительные опции.

2. **Outputs schema — нужен ли в Phase 1**
   - What we know: `registerTool` опционально принимает `outputSchema`; без него SDK возвращает `content[]` как есть.
   - What's unclear: валидирует ли `tools/list` наличие outputSchema.
   - Recommendation: Phase 1 — без outputSchema (stub'ы всё равно throw'ают). Phase 2/3 добавят вместе с handler'ом.

3. **bin-shebang на Windows**
   - What we know: проект разработан на Windows (see <env>), pnpm создаёт `.cmd` shim.
   - What's unclear: нужен ли отдельный Windows-path в `bin` entry.
   - Recommendation: стандартный `"bin": { "llm-wiki-mcp": "./dist/main.js" }` с `#!/usr/bin/env node` работает через pnpm на Windows (shim). Unit-тест запускается через `node dist/main.js` напрямую.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime | ✓ | >=20 required, 22 recommended | — |
| pnpm | build / workspace | ✓ | 9.x / 10.x (lockfile v9) | — |
| TypeScript | build | ✓ (dev dep) | 5.9.3 | — |
| Vitest | tests | ✓ (dev dep) | 3.2.4 | — |
| `@modelcontextprotocol/sdk@^1.29.0` | mcp-server transport | ✗ (нужно добавить) | — | none — blocking dep |
| `zod@^3.25` | mcp-server schemas | ✗ (транзитивно через SDK, нужно явно) | — | hand-written JSON Schema (отклонено в §Alternatives) |
| Git CLI | существующие адаптеры GitVersionControl (через composition) | ✓ | — | — |

**Missing dependencies with no fallback:** `@modelcontextprotocol/sdk`, `zod` — установить в plan task-0 (Wave 0).

**Missing dependencies with fallback:** нет.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `packages/{common,mcp-server}/vitest.config.ts` (создать per pattern infra) + root `vitest.workspace.ts` (обновить) |
| Quick run command | `pnpm --filter @llm-wiki/mcp-server test` |
| Full suite command | `pnpm test` (all workspaces via `pnpm -r test`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIRE-01 | `buildContainer(config)` возвращает 7 service instances с корректными типами, никаких null/undefined | unit | `pnpm --filter @llm-wiki/common test` | Wave 0 |
| WIRE-01 | `buildContainer` корректно прокидывает `FileStoreFactory` в IngestService (ctor accepts и factory callable) | unit | `pnpm --filter @llm-wiki/common test` | Wave 0 |
| WIRE-02 | `ConfigLoader` читает `mcp.host`/`mcp.port` из YAML и `LLM_WIKI_MCP_HOST`/`PORT` из env, env wins | unit | `pnpm --filter @llm-wiki/infra test` (test добавляется к существующему `config-loader.test.ts` если есть, иначе новый) | Wave 0 |
| MCP-01 | `startServer` слушает на `127.0.0.1:<port>`; POST /mcp с `tools/list` возвращает JSON со всеми 7 именами | integration | `pnpm --filter @llm-wiki/mcp-server test` | Wave 0 |
| MCP-01 | POST /mcp с `tools/call` для каждого из 7 tools → JSON-RPC error с message содержит `'not_implemented'` | integration | `pnpm --filter @llm-wiki/mcp-server test` | Wave 0 |
| MCP-01 | GET /mcp → 405 Method Not Allowed | integration | same | Wave 0 |
| MCP-01 | `startServer` → `handle.close()` освобождает порт (второй `startServer` на том же порту успешен) | integration | same | Wave 0 |
| WIRE-01 | (опц.) Schema each tool's inputSchema content matches expected field names (всё из §Tool Input Schemas) | unit | `pnpm --filter @llm-wiki/mcp-server test` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @llm-wiki/<package> test` — пакетные unit
- **Per wave merge:** `pnpm test && pnpm lint` (lint = tsc -b — type check)
- **Phase gate:** `pnpm test` полностью зелёное + `tsc -b` зелёный перед `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/common/package.json` + `tsconfig.json` + `vitest.config.ts` + `src/index.ts`
- [ ] `packages/mcp-server/package.json` (с `bin` field) + `tsconfig.json` + `vitest.config.ts` + `src/index.ts`
- [ ] Root `vitest.workspace.ts` — добавить `'packages/common'`, `'packages/mcp-server'`
- [ ] Root `tsconfig.json` — добавить references
- [ ] `packages/common/tests/build-container.test.ts` — новый
- [ ] `packages/mcp-server/tests/server.integration.test.ts` — новый (ephemeral port pattern)
- [ ] `packages/mcp-server/tests/tools/stubs.test.ts` — новый
- [ ] `packages/infra/tests/config-loader.test.ts` — либо расширить существующий (verify grep), либо добавить секцию для `mcp.*`
- [ ] `pnpm install` — подтянуть `@modelcontextprotocol/sdk`, `zod` в `@llm-wiki/mcp-server`
- [ ] (опц.) `.githooks/pre-commit` — RULES.md требует, но это может быть отдельная issue

## Sources

### Primary (HIGH confidence)

- Codebase — все конструкторы сервисов, ports, ConfigLoader, integration test patterns [VERIFIED via Read + Grep]
- `.planning/phases/01-composition-root-and-mcp-bootstrap/01-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` — requirements & success criteria
- `npm view @modelcontextprotocol/sdk` — version 1.29.0, published 2026-03-30 [VERIFIED 2026-04-12]
- `npm view @modelcontextprotocol/sdk dependencies` — Zod is a direct dependency [VERIFIED 2026-04-12]

### Secondary (MEDIUM confidence)

- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md — v1.x рекомендуется, v2 pre-alpha Q1 2026 [WebFetch]
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md — registerTool + transport + close() semantics [WebFetch, partial]
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/server/README.md — example file names (`simpleStatelessStreamableHttp.ts` и др) [WebFetch]
- https://mcp.holt.courses/lessons/sses-and-streaming-html/streamable-http — stateless vs stateful pattern [WebSearch]
- GitHub issues #340, #360, #412 в SDK — per-request instance requirement в stateless [WebSearch, summary]

### Tertiary (LOW confidence)

- Точные значения `ErrorCode` enum — training-based, requires SDK .d.ts verification post-install (см. A1, A2 в Assumptions).

## Metadata

**Confidence breakdown:**

- Composition root / service constructors: HIGH — читал grep+integration tests, сигнатуры верифицированы.
- ConfigLoader extension: HIGH — читал полный source.
- MCP SDK registerTool shape: HIGH — Zod + object-config подтверждён в docs/server.md и SDK README pattern.
- StreamableHTTPServerTransport stateless bare-http pattern: MEDIUM — паттерн подтверждён WebSearch + SDK issue thread, но точный bare `node:http` пример из официальных examples — адаптация Express-шаблона. Риск: типы аргументов `handleRequest` для node:http против express `Request` в v1.29.0 (ожидается совместимость, req/res — стандартные IncomingMessage/ServerResponse).
- ErrorCode enum values: LOW — не верифицированы verbatim; имя `ErrorCode.InternalError` — общепринятое, безопасно использовать по имени без хардкода числа.
- Tool schemas: HIGH — доменные request типы прочитаны напрямую.

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 дней — SDK v1 стабильна, ecosystem зрелый). Если начинается Phase 2 после выхода SDK v2 stable — перепроверить импорт-пути.
