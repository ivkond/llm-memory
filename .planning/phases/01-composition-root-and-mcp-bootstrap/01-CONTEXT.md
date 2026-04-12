# Phase 1: Composition Root and MCP Bootstrap - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Собрать единый composition root, который через `ConfigLoader` инстанцирует все инфраструктурные адаптеры (FsFileStore, FsVerbatimStore, GitVersionControl, GitProjectResolver, RuVectorSearchEngine, AiSdkLlmClient, AiSdkEmbeddingClient, YamlStateStore, FsSourceReader/HttpSourceReader/CompositeSourceReader, SanitizationService, + M3-адаптеры если уже в main) и внедряет их конструктором в доменные сервисы (RememberService, RecallService, QueryService, IngestService, WikiStatusService, LintService, ImportService, ArchiveService), а затем поднять MCP-сервер на Streamable HTTP транспорте, регистрирующий все 7 MCP tools так, чтобы `tools/list` возвращал корректные имена и schemas.

**В фазе НЕТ:** реальной бизнес-логики handlers — она приходит в Phase 2 (read tools) и Phase 3 (write tools). Handlers фазы 1 — stub'ы, возвращающие `McpError('not_implemented')`.

**Новые capability, которые здесь НЕ добавляются** (scope guard):
- CLI (→ Phase 4)
- Claude Code hooks / `/wiki` skill (→ Phase 5)
- stdio transport (→ out of scope per PROJECT.md)
- Auth / multi-tenant (→ out of scope, solo use)

</domain>

<decisions>
## Implementation Decisions

### Package Layout & Wiring

- **D-01:** Composition root живёт в отдельном workspace-пакете **`@llm-wiki/common`** (директория `packages/common/`). Пакет экспортирует фабричную функцию `buildContainer(config: WikiConfig): AppServices` (или эквивалент), которая создаёт адаптеры и собирает сервисы.
  - **Почему:** CLI (Phase 4) будет инстанцировать те же сервисы. DRY с самого начала, чистая граница transport ↔ wiring. `@llm-wiki/infra` остаётся чистым слоем адаптеров, не знающим о `core/services`.
  - **Как применять:** `@llm-wiki/common` depends on `@llm-wiki/core` + `@llm-wiki/infra`. `@llm-wiki/mcp-server` depends on `@llm-wiki/common` (не напрямую на `infra`). Все tsconfig project references обновить.
- **D-02:** `@llm-wiki/mcp-server` — новый тонкий workspace-пакет (директория `packages/mcp-server/`). Содержит: `main.ts` (entry point/bin), `server.ts` (setup McpServer + StreamableHTTPServerTransport + node:http listener), `tools/` (регистрация 7 tools + schemas + stub handlers). **Никакой бизнес-логики** — только маппинг MCP request → вызов метода сервиса → MCP response. В Phase 1 маппинг заглушен.

### HTTP Transport

- **D-03:** HTTP-сервер — чистый **`node:http.createServer()`** + `StreamableHTTPServerTransport` из `@modelcontextprotocol/sdk`. Никаких express/fastify.
  - **Почему:** 0 новых зависимостей, полный контроль над lifecycle и graceful shutdown, solo-use сценарий не требует middleware/auth. Соответствует YAGNI.
  - **Как применять:** request handler получает `req/res`, передаёт в `transport.handleRequest(req, res, body)` согласно Streamable HTTP спецификации MCP. Поддержать standard endpoints (POST для JSON-RPC, GET для SSE notifications если нужно).
- **D-04:** Порт и хост читаются через `ConfigLoader` — YAML defaults (`mcp.port`, `mcp.host`) + env overrides (`LLM_WIKI_MCP_PORT`, `LLM_WIKI_MCP_HOST`). Значения по умолчанию: host=`127.0.0.1`, port=`TBD планировщиком` (например, 7849 — стабильный неиспользуемый).

### Tool Registration

- **D-05:** **Все 7 tools регистрируются в Phase 1** с полными именами и input-schemas:
  - `wiki_query`, `wiki_recall`, `wiki_remember_fact`, `wiki_remember_session`, `wiki_ingest`, `wiki_lint`, `wiki_status`.
  - **Почему:** Success Criteria #3 фазы явно требует, чтобы `tools/list` возвращал 7 tool names. Stub-стратегия минимизирует риск рефакторинга registry в фазах 2-3 — они только заменят тело handler.
  - **Как применять:** Каждый handler в Phase 1 — функция вида `async () => { throw new McpError(ErrorCode.InternalError, 'wiki_<name>: not_implemented (Phase 2/3)') }`. Schemas уже финальные (на основе доменных request-типов) — Phase 2/3 их не меняют, только подключают вызов сервиса.
- **D-06:** Schemas инструментов выводятся из существующих request-типов доменных сервисов (`RememberFactRequest`, `QueryRequest`, `RecallRequest`, `IngestRequest`, `LintRequest`, `StatusRequest`). Если сервис использует TypeScript type — конвертировать в JSON Schema вручную либо через Zod (Zod — новый dep; планировщик решит trade-off). Для Phase 1 допустимы минимальные schemas — достаточные, чтобы `tools/list` прошёл валидацию клиента.

### Lifecycle (Claude's Discretion)

Планировщику даётся свобода в:
- Выборе точного номера default порта (в пределах 7000–9999, не конфликтующего с известными сервисами).
- Реализации graceful shutdown: SIGINT/SIGTERM → закрыть transport → `server.close()` → `process.exit(0)` — но детали таймаутов и drain logic на усмотрение планировщика.
- Выборе bin-имени (`llm-wiki-mcp` рекомендовано, но не обязательно).
- Логировании: `console.error` для stderr-логов в Phase 1 достаточно (pino/winston — оверкилл для solo). Планировщик может предложить простой wrapper `logger.ts`.
- Health-endpoint (GET `/healthz`) — nice-to-have, не обязателен для SC.

### Folded Todos

Нет.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & Architecture
- `docs/superpowers/specs/2026-04-10-llm-wiki-design.md` §Overall Architecture (lines 55–93) — пакетная структура, dependency graph, правила слоёв. §MCP Server (lines ~600+) — список 7 tools и их назначение.
- `.planning/PROJECT.md` — constraints, key decisions (Streamable HTTP locked, transport packages thin).
- `.planning/REQUIREMENTS.md` §Transport — MCP — MCP-01 (server starts, tools/list отвечает), WIRE-01, WIRE-02.
- `.planning/ROADMAP.md` §Phase 1 — точные Success Criteria.

### Code (existing adapters/services for wiring)
- `packages/core/src/index.ts` — публичный API сервисов и портов, которые будут инжектиться.
- `packages/infra/src/index.ts` — все адаптеры, включая `ConfigLoader` и `WikiConfig`.
- `packages/core/src/services/` — конструкторы сервисов (порты, которые нужны).

### Configuration
- Существующая схема `WikiConfig` в `@llm-wiki/infra` — расширить для `mcp.port`/`mcp.host` или зависеть от env-onlysettings (решит планировщик).
- Env vars: существующие `LLM_WIKI_PATH`, `LLM_WIKI_LLM_*`, `LLM_WIKI_EMBEDDING_*` + новые `LLM_WIKI_MCP_PORT`, `LLM_WIKI_MCP_HOST`.

### External
- `@modelcontextprotocol/sdk` — **обязательно использовать Context7** (`mcp__context7__*`) или официальную документацию для актуального API `McpServer` и `StreamableHTTPServerTransport` — training cutoff может опережать реальный API.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ConfigLoader` + `WikiConfig`** (`packages/infra/src/config-loader.ts`) — уже умеет shared YAML + local YAML + env overrides. Добавить только mcp.* ключи.
- **Все доменные сервисы** уже существуют и инстанцируются в integration-тестах с реальными адаптерами (`packages/infra/tests/integration/*.test.ts`) — wiring-паттерн уже отработан, его надо только канонизировать в `@llm-wiki/common`.
- **`FileStoreFactory`** — обратить внимание: `IngestService` принимает фабрику `(rootDir) => IFileStore`, не сам IFileStore. composition root должен правильно собрать эту фабрику.

### Established Patterns
- **Named exports only, barrel `index.ts`** — новый `@llm-wiki/common` следует этому же правилу.
- **ESM, NodeNext, `.js` extensions в relative imports** — обязательно.
- **tsconfig project references** — `packages/common/tsconfig.json` должен reference `../core` и `../infra`; `packages/mcp-server/tsconfig.json` → `../common`.
- **Testing Trophy: integration > unit** — для composition root имеет смысл писать integration-test (поднять сервер на random port, дёрнуть tools/list, получить 7 имён) + unit на отдельные функции сборки.

### Integration Points
- Корневой `tsconfig.json` — добавить references на новые пакеты.
- Корневой `package.json` scripts — `build` (tsc -b) подхватит новые пакеты автоматически. Добавить `start:mcp` или оставить через `pnpm --filter @llm-wiki/mcp-server dev`.
- `pnpm-workspace.yaml` — `packages/*` уже охватывает, новые пакеты подхватятся автоматически.

### Pre-commit
- `.githooks/pre-commit` должен запускать type-check на всех пакетах включая новые (tsc -b из корня уже это делает).

</code_context>

<specifics>
## Specific Ideas

- Пакет wiring'а назвать именно **`@llm-wiki/common`** (не `composition`, не `wiring`) — решение пользователя.
- Handler'ы Phase 1 обязаны использовать стандартный `McpError` из `@modelcontextprotocol/sdk`, чтобы Phase 2/3 не меняли контракт ошибок.
- Solo use, local workstation — не закладывать auth/TLS в Phase 1.

</specifics>

<deferred>
## Deferred Ideas

- **Health endpoint (`/healthz`)** — обсудим, если понадобится для monitoring; сейчас не входит в SC.
- **pino / structured logging** — только если прод-использование покажет необходимость; для solo `console.error` достаточно.
- **Auth, CORS, TLS** — не для solo MVP.
- **Express/Fastify** — отклонено, может вернуться если появятся сложные middlewares.
- **MCP stdio transport** — out of scope per PROJECT.md.
- **Точная стратегия Zod vs ручные JSON schemas** — планировщик решит в Phase 1 plan.

</deferred>

---

*Phase: 01-composition-root-and-mcp-bootstrap*
*Context gathered: 2026-04-12*
