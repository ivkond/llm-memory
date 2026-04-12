/**
 * Minimal stderr logger for the MCP server.
 *
 * Contract:
 * - Never logs request bodies or tool arguments (may contain user content) —
 *   only signal names, bind info, and error types / messages (T-01-12).
 * - Writes to stderr exclusively; stdout is reserved for any future stdio
 *   transport and must remain clean.
 * - No `console.*`: direct `process.stderr.write` keeps the surface small and
 *   avoids accidental stdout pollution (Node `console.log` → stdout).
 */

const PREFIX = '[llm-wiki-mcp]';

export function logInfo(message: string): void {
  process.stderr.write(`${PREFIX} ${message}\n`);
}

export function logError(message: string, err?: unknown): void {
  const suffix = err === undefined ? '' : `: ${formatError(err)}`;
  process.stderr.write(`${PREFIX} ERROR ${message}${suffix}\n`);
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}
