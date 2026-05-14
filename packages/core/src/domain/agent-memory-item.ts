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
  sessionId: string;
  project?: string;
  content: string;
  mtime?: string;
  sourceUri?: string;
  sourceDigest?: string;
  sourceType?: string;
}

export class AgentMemoryItem {
  private constructor(
    public readonly agent: string,
    public readonly sourcePath: string,
    public readonly sessionId: string,
    public readonly project: string | undefined,
    public readonly content: string,
    public readonly mtime: string | undefined,
    public readonly sourceUri: string,
    public readonly sourceDigest: string | undefined,
    public readonly sourceType: string,
  ) {}

  static create(data: AgentMemoryItemData): AgentMemoryItem {
    assertIdentifier('agent', data.agent);
    assertIdentifier('sessionId', data.sessionId);
    if (!data.sourcePath) throw new Error('AgentMemoryItem.sourcePath required');
    if (!data.content) throw new Error('AgentMemoryItem.content required');
    if (!data.mtime && !data.sourceDigest) {
      throw new Error('AgentMemoryItem requires mtime or sourceDigest');
    }
    return new AgentMemoryItem(
      data.agent,
      data.sourcePath,
      data.sessionId,
      data.project,
      data.content,
      data.mtime,
      data.sourceUri ?? data.sourcePath,
      data.sourceDigest,
      data.sourceType ?? data.agent,
    );
  }

  get dedupeKey(): string {
    if (this.sourceDigest) {
      return `${this.agent}:${this.sessionId}:${this.sourceUri}:${this.sourceDigest}`;
    }
    return `${this.agent}:${this.sessionId}:${this.sourceUri}:${this.mtime ?? ''}`;
  }
}
