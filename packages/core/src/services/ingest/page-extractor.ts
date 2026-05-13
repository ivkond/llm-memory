import { LlmUnavailableError } from '../../domain/errors.js';
import type { ILlmClient } from '../../ports/llm-client.js';
import { validateIngestTargetPath } from './path-policy.js';
import type { ExtractedPage } from './types.js';

const INGEST_SYSTEM_PROMPT =
  'You are a wiki editor. Extract high-signal reference pages from the given source. ' +
  'Respond with a JSON array of objects: [{ "path": "wiki/...", "title": "...", "content": "..." }]. ' +
  'Prefer short, durable summaries. Cross-link related pages with relative markdown links.';

export class IngestPageExtractor {
  constructor(private readonly llmClient: ILlmClient) {}

  /**
   * Ask the LLM to extract structured wiki pages from the source content.
   * The prompt requires a JSON array response; anything else is treated as
   * a parse failure and surfaced as `LlmUnavailableError` by the caller.
   */
  async extractPages(
    source: { uri: string; content: string },
    hint?: string,
  ): Promise<ExtractedPage[]> {
    const userMessage =
      (hint ? `Hint: ${hint}\n\n` : '') +
      `Source URI: ${source.uri}\n\nSource content:\n${source.content}\n\n` +
      'Reply with a JSON array of pages.';

    const response = await this.llmClient.complete({
      system: INGEST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.1,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(response.content));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(`model returned non-JSON: ${message}`);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new LlmUnavailableError('model returned empty or non-array page list');
    }

    const pages: ExtractedPage[] = [];
    for (const raw of parsed) {
      if (
        typeof raw !== 'object' ||
        raw === null ||
        typeof (raw as { path?: unknown }).path !== 'string' ||
        typeof (raw as { title?: unknown }).title !== 'string' ||
        typeof (raw as { content?: unknown }).content !== 'string'
      ) {
        throw new LlmUnavailableError('model returned malformed page entry');
      }
      const obj = raw as { path: string; title: string; content: string };
      // Validate model-provided path before any filesystem writes.
      validateIngestTargetPath(obj.path);
      pages.push({ path: obj.path, title: obj.title, content: obj.content });
    }
    return pages;
  }
}

/** Some models wrap JSON output in ``` fences; trim them conservatively. */
function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}
