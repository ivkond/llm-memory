export interface LlmCompletionRequest {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompletionResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ILlmClient {
  /** Generate a completion. */
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}
