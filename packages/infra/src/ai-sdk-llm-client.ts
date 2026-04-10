import { generateText, type LanguageModel } from 'ai';
import type {
  ILlmClient,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '@llm-wiki/core';
import { LlmUnavailableError } from '@llm-wiki/core';

/**
 * Thin adapter from the domain's `ILlmClient` port to the Vercel AI SDK's
 * `generateText()` function. The constructor takes a `LanguageModel` so
 * composition code can swap in any provider (OpenAI, Anthropic, mock, …)
 * without this file ever knowing about the provider.
 *
 * INV-3 semantics (graceful degradation to raw search results on LLM
 * failure) are implemented in `QueryService` — this adapter's only job is
 * to translate provider errors into the domain-level `LlmUnavailableError`
 * so the service can pattern-match on the error class.
 */
export class AiSdkLlmClient implements ILlmClient {
  constructor(private readonly model: LanguageModel) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    try {
      const result = await generateText({
        model: this.model,
        system: request.system,
        messages: request.messages,
        // AI SDK 5.x: caller-facing option for max generation length.
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
      });

      // AI SDK 5.x surfaces usage as plain numbers on the v2 spec. Fields can
      // be `undefined` for mock models that omit them.
      return {
        content: result.text,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(message);
    }
  }
}
