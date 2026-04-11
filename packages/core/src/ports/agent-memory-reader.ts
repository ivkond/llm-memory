import type { AgentMemoryItem } from '../domain/agent-memory-item.js';

export interface AgentMemoryDiscoveryOptions {
  /** Glob/base paths to scan (resolved by the adapter). */
  paths: string[];
  /**
   * Only return items whose mtime is strictly greater than this ISO-8601 UTC
   * timestamp. `null` means "return everything".
   */
  since: string | null;
}

export interface IAgentMemoryReader {
  /** Agent identifier this reader handles (e.g. `'claude-code'`). */
  readonly agent: string;

  /** Enumerate new memory items under the configured paths. */
  discover(options: AgentMemoryDiscoveryOptions): Promise<AgentMemoryItem[]>;
}
