type ToolResponsePayload = Record<string, unknown>;

export function toOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return undefined;
}

export function textToolResponse(payload: ToolResponsePayload) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}

export function toolSuccess(data: ToolResponsePayload) {
  return textToolResponse({ success: true, data });
}

export function toolError(error: string, code: string) {
  return textToolResponse({ success: false, error, code });
}
