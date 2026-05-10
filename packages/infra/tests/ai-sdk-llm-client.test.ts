import { describe, it, expect } from 'vitest';
import { MockLanguageModelV2 } from 'ai/test';
import { AiSdkLlmClient } from '../src/ai-sdk-llm-client.js';
import { LlmUnavailableError } from '@ivkond-llm-wiki/core';

/**
 * Build a v2-spec `doGenerate` result with a single text content block.
 *
 * AI SDK 5.x ships the v2 model spec: `finishReason` is a plain string literal
 * and `usage` holds plain numbers. The `V3` variants the original plan draft
 * referenced are not published yet.
 */
function ok(text: string, input = 10, output = 20) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: 'stop' as const,
    usage: { inputTokens: input, outputTokens: output, totalTokens: input + output },
    warnings: [],
  };
}

describe('AiSdkLlmClient', () => {
  it('test_complete_returnsContentAndUsage', async () => {
    const model = new MockLanguageModelV2({
      doGenerate: async () => ok('Hello world', 12, 34),
    });
    const client = new AiSdkLlmClient(model);

    const response = await client.complete({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(response.content).toBe('Hello world');
    expect(response.usage.inputTokens).toBe(12);
    expect(response.usage.outputTokens).toBe(34);
  });

  it('test_complete_providerThrows_wrappedAsLlmUnavailable', async () => {
    const model = new MockLanguageModelV2({
      doGenerate: async () => {
        throw new Error('boom');
      },
    });
    const client = new AiSdkLlmClient(model);

    await expect(
      client.complete({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it('test_complete_passesSystemAndTemperature', async () => {
    let captured: unknown;
    const model = new MockLanguageModelV2({
      doGenerate: async (options) => {
        captured = options;
        return ok('ok', 1, 1);
      },
    });
    const client = new AiSdkLlmClient(model);

    await client.complete({
      system: 'you are a wiki',
      messages: [{ role: 'user', content: 'x' }],
      temperature: 0.1,
      maxTokens: 42,
    });

    expect(captured).toBeDefined();
    // AI SDK forwards temperature directly to doGenerate.
    expect(captured.temperature).toBe(0.1);
    // maxOutputTokens is the caller-facing option in AI SDK 5.x; it lands on
    // the call options as `maxOutputTokens`.
    expect(captured.maxOutputTokens).toBe(42);
  });

  it('test_complete_undefinedUsage_returnsZero', async () => {
    const model = new MockLanguageModelV2({
      doGenerate: async () => ({
        content: [{ type: 'text' as const, text: 'ok' }],
        finishReason: 'stop' as const,
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        },
        warnings: [],
      }),
    });
    const client = new AiSdkLlmClient(model);

    const response = await client.complete({
      messages: [{ role: 'user', content: 'x' }],
    });

    expect(response.usage.inputTokens).toBe(0);
    expect(response.usage.outputTokens).toBe(0);
  });
});
