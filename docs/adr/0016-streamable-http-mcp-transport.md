# ADR-0016: Streamable HTTP MCP Transport

- Status: Accepted
- Date: 2026-05-10
- Supersedes: older design notes that mentioned MCP stdio for v1
- Source documents:
  - `.planning/REQUIREMENTS.md`
  - `.planning/phases/01-composition-root-and-mcp-bootstrap/01-CONTEXT.md`
  - `.planning/phases/01-composition-root-and-mcp-bootstrap/01-02-SUMMARY.md`

## Context

The project needs a local MCP server for agent access and Claude Code hooks. A web framework and stdio transport are unnecessary for the solo local scope.

## Decision

Use MCP Streamable HTTP over Node `http`. The server exposes `POST /mcp`, returns 405 for non-POST `/mcp`, returns 404 for other paths, uses stateless per-request `McpServer` and `StreamableHTTPServerTransport`, enables JSON responses, binds to loopback by default, and caps request bodies.

## Consequences

- Hooks and local clients can call one loopback HTTP endpoint.
- No Express/Fastify dependency is required.
- Stateless per-request transport reduces request-collision risk.
- Browser or remote use would need future CORS/auth decisions.

## Alternatives considered

- MCP stdio: out of scope for v1.
- Express/Fastify: rejected as unnecessary dependency and lifecycle complexity.
- Stateful shared MCP server instance per process: rejected in favor of request isolation.

## Implementation notes

`packages/mcp-server/src/server.ts` owns the HTTP server and MCP request handling. `ConfigLoader` provides `mcp.host` and `mcp.port`.

## Open questions

None.
