# Phase 1: Composition Root and MCP Bootstrap - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 01-composition-root-and-mcp-bootstrap
**Areas discussed:** Composition root placement, HTTP server ownership, Tool registration strategy
**Areas deferred to Claude's Discretion:** Lifecycle & config surface

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Composition root placement | Где живёт wiring: отдельный пакет / в infra / в mcp-server | ✓ |
| HTTP server ownership | node:http + SDK / express / fastify | ✓ |
| Tool registration strategy | Все 7 stub / feature-flag / schemas only | ✓ |
| Lifecycle & config surface | Port/host, shutdown, logger, bin name | (deferred to Claude) |

---

## Composition root placement

| Option | Description | Selected |
|--------|-------------|----------|
| Новый пакет @llm-wiki/composition (Recommended) | Отдельный workspace-пакет экспортирует buildContainer(config), reused by CLI+MCP. DRY сразу. | ✓ (переименован) |
| Модуль в @llm-wiki/infra | packages/infra/src/composition/. Меньше пакетов, но infra начинает знать services. | |
| В mcp-server, дублировать позже в cli | YAGNI: сделаем сейчас, в Phase 4 копия или Strangler Fig. | |

**User's choice:** Вариант 1 — отдельный пакет, с корректировкой имени.
**Notes:** Пользователь явно попросил назвать пакет **`common`** вместо `composition`. Итоговое имя: `@llm-wiki/common`.

---

## HTTP server ownership

| Option | Description | Selected |
|--------|-------------|----------|
| node:http + SDK transport (Recommended) | http.createServer() + StreamableHTTPServerTransport из @modelcontextprotocol/sdk. 0 новых зависимостей. | ✓ |
| express поверх SDK transport | +express dep. Лучше для middlewares, но solo избыточно. | |
| fastify поверх SDK transport | Быстрее, но +dep и интеграция с SDK transport требует raw hooks. | |

**User's choice:** node:http + SDK transport.
**Notes:** Нет.

---

## Tool registration strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Все 7 с stub-handler → McpError('not_implemented') (Recommended) | Schemas + handlers существуют, handlers throw. Phase 2/3 только заменяют тело. | ✓ |
| Feature-flag per tool (enabled:false) | Registry содержит все 7, tools/list фильтрует. Ломает SC#3 (tools/list < 7 пока флаги false). | |
| Только schemas, без handlers | tools/list отвечает, tools/call даёт generic method not found. Менее диагностично. | |

**User's choice:** Stub-handlers с `McpError('not_implemented')`.
**Notes:** Нет.

---

## Claude's Discretion

Пользователь пропустил зону **Lifecycle & config surface** — планировщику делегированы:
- Точный default port (7000–9999 диапазон).
- SIGINT/SIGTERM graceful shutdown детали.
- Bin script name (`llm-wiki-mcp` рекомендовано).
- Logger: `console.error` на stderr для Phase 1.
- Health endpoint — опционально.

## Deferred Ideas

- Health endpoint `/healthz` — если понадобится для monitoring.
- pino / structured logging — только при прод-необходимости.
- Auth / CORS / TLS — out of scope для solo MVP.
- Express/Fastify — отклонено, не исключено при усложнении middleware.
- MCP stdio transport — out of scope per PROJECT.md.
- Zod vs ручные JSON schemas — планировщик решит.
