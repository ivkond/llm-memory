# ADR-0013: Vercel AI SDK Provider Adapters

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/INTEGRATIONS.md`
  - `.planning/codebase/STACK.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

LLM Wiki needs completions for query synthesis, ingest extraction, and lint consolidation, plus embeddings for vector search. The project is TypeScript-first and should avoid hard-coding one provider.

## Decision

Use Vercel AI SDK (`ai`) with `@ai-sdk/openai` as the default provider. Core exposes `ILlmClient` and `IEmbeddingClient` ports. Infra adapters accept AI SDK language and embedding models, keeping provider selection in config and composition.

## Consequences

- Providers can be swapped without changing core services.
- TypeScript-native integration fits the monorepo.
- Live operations depend on provider availability and API keys.
- Query degrades gracefully on LLM failure; ingest/lint fail safely.

## Alternatives considered

- Direct OpenAI SDK: rejected because it is less provider-neutral.
- LiteLLM: rejected because it is Python-centric.
- Local-only LLM stack: deferred due to setup and performance complexity.

## Implementation notes

`AiSdkLlmClient` and `AiSdkEmbeddingClient` implement the core ports.

## Open questions

None.
