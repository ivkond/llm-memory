import type { AgentMemoryItem } from '../domain/agent-memory-item.js';

export interface AgentMemoryDiscoveryOptions {
  paths: string[];
  since: string | null;
}

export interface IAgentMemoryReader {
  readonly agent: string;

  discover(options: AgentMemoryDiscoveryOptions): Promise<AgentMemoryItem[]>;
}
