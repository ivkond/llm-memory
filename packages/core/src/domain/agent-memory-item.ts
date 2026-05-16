import { InvalidIdentifierError } from './errors.js';

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function assertIdentifier(field: string, value: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new InvalidIdentifierError(field, value);
  }
}

export interface AgentMemoryItemData {
  agent: string;
  sourcePath: string;
  sourceType?: string;
  sourceUri?: string;
  sourceDigest?: string;
  sourceMtime?: string;
  sessionId: string;
  project?: string;
  content: string;
  mtime: string;
}

export class AgentMemoryItem {
  private constructor(
    public readonly agent: string,
    public readonly sourcePath: string,
    public readonly sourceType: string,
    public readonly sourceUri: string,
    public readonly sourceDigest: string | undefined,
    public readonly sourceMtime: string,
    public readonly sessionId: string,
    public readonly project: string | undefined,
    public readonly content: string,
    public readonly mtime: string,
  ) {}

  static create(data: AgentMemoryItemData): AgentMemoryItem {
    assertIdentifier('agent', data.agent);
    assertIdentifier('sessionId', data.sessionId);
    if (!data.sourcePath) throw new Error('AgentMemoryItem.sourcePath required');
    if (!data.content) throw new Error('AgentMemoryItem.content required');
    if (!data.mtime) throw new Error('AgentMemoryItem.mtime required');
    const sourceType = data.sourceType ?? data.agent;
    const sourceUri = data.sourceUri ?? data.sourcePath;
    const sourceMtime = data.sourceMtime ?? data.mtime;
    return new AgentMemoryItem(
      data.agent,
      data.sourcePath,
      sourceType,
      sourceUri,
      data.sourceDigest,
      sourceMtime,
      data.sessionId,
      data.project,
      data.content,
      data.mtime,
    );
  }

  get dedupeKey(): string {
    return `${this.agent}:${this.sessionId}:${this.sourcePath}`;
  }
}
