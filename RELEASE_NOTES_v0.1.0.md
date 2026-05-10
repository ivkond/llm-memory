# Release Notes Draft — v0.1.0

## Summary

This release publishes only two public npm runtime packages:
- `@ivkond-llm-wiki/cli`
- `@ivkond-llm-wiki/mcp-server`

Internal workspace packages `@ivkond-llm-wiki/core`, `@ivkond-llm-wiki/infra`, and `@ivkond-llm-wiki/common` are not published as separate npm packages.

## Packaging strategy (Strategy B)

- CLI and MCP packages are bundled with `tsup`.
- Internal workspace dependencies are bundled into published artifacts.
- Node builtins and third-party dependencies remain external runtime dependencies.

## Published package entrypoints

- `@ivkond-llm-wiki/cli` bins: `llm-wiki`, `multica`
- `@ivkond-llm-wiki/mcp-server` bin: `llm-wiki-mcp`

## Release validation

- Tag version check for runtime workspace packages.
- Typecheck, build, tests.
- Pack dry-run with guardrails:
  - no `workspace:*` protocols in packed manifests
  - no internal `@ivkond-llm-wiki/{core,infra,common}` runtime deps in packed CLI/MCP manifests
- Docker image build + smoke startup for MCP server.
