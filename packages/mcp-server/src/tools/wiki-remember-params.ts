export interface CommonRememberParams {
  agent: string;
  sessionId: string;
  project?: string;
  sourceUri?: string;
  sourceDigest?: string;
  operationId?: string;
  modelProvider?: string;
  modelName?: string;
  callId?: string;
  toolCallId?: string;
}

export function readCommonRememberParams(params: Record<string, unknown>): CommonRememberParams {
  return {
    agent: params.agent != null ? String(params.agent) : '',
    sessionId: params.sessionId != null ? String(params.sessionId) : '',
    project: params.project != null ? String(params.project) : undefined,
    sourceUri: params.source_uri != null ? String(params.source_uri) : undefined,
    sourceDigest: params.source_digest != null ? String(params.source_digest) : undefined,
    operationId: params.operation_id != null ? String(params.operation_id) : undefined,
    modelProvider: params.model_provider != null ? String(params.model_provider) : undefined,
    modelName: params.model_name != null ? String(params.model_name) : undefined,
    callId: params.call_id != null ? String(params.call_id) : undefined,
    toolCallId: params.tool_call_id != null ? String(params.tool_call_id) : undefined,
  };
}
