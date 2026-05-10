# ADR-0017: MCP JSON Response Envelope

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/phases/02-mcp-read-tools/02-01-SUMMARY.md`
  - `.planning/phases/03-mcp-write-tools/03-01-SUMMARY.md`

## Context

MCP tool callers need predictable application-level success and error responses across read and write tools. Some planning context mentioned MCP errors for service failures, but implementation summaries settled on JSON in text content.

## Decision

MCP handlers return a JSON envelope in `TextContent.text`:

- Success: `{ "success": true, "data": T }`
- Failure: `{ "success": false, "error": string, "code"?: string }`

Protocol and validation errors can still be handled by the MCP SDK; application failures use the envelope.

## Consequences

- Callers parse one response pattern for every tool.
- Service errors do not necessarily become transport failures.
- Documentation must state that the first text content item contains JSON.
- Envelope shape must remain stable unless versioned.

## Alternatives considered

- Throw MCP errors for all service failures: rejected because agents then lose structured partial results.
- Tool-specific response formats: rejected due to caller complexity.

## Implementation notes

Read tools adopted the envelope in Phase 2. Mutating tools adopted the same pattern in Phase 3.

## Open questions

None.
