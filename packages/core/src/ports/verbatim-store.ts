import type { ProcessingStatus, VerbatimEntry } from '../domain/verbatim-entry.js';
import type { FileInfo } from './file-store.js';

export interface IVerbatimStore {
  /** Write a VerbatimEntry to disk as markdown (serialization owned by infra). */
  writeEntry(entry: VerbatimEntry): Promise<void>;

  /** Find verbatim entries with consolidated: false for a given agent. */
  listUnconsolidated(agent: string): Promise<FileInfo[]>;

  /** Count unconsolidated entries across all agents. */
  countUnconsolidated(): Promise<number>;

  /** Find entries by processing status for a given agent. */
  listByProcessingStatus(agent: string, statuses: ProcessingStatus[]): Promise<FileInfo[]>;

  /** Count entries across all agents by status (all statuses when omitted). */
  countByProcessingStatus(statuses?: ProcessingStatus[]): Promise<number>;

  /**
   * List agent identifiers that currently have at least one verbatim entry
   * on disk. Returned in deterministic (sorted) order so callers can rely on
   * stable iteration for batching. Empty array when no `log/` tree exists.
   */
  listAgents(): Promise<string[]>;

  /** Load a single entry by relative path. Returns null if missing. */
  readEntry(filePath: string): Promise<VerbatimEntry | null>;

  /**
   * Flip the `consolidated` flag to `true` for the entry at `filePath`.
   * Idempotent: a no-op if already consolidated. Throws if the file does
   * not exist.
   */
  markConsolidated(filePath: string): Promise<void>;

  /** Set processing status for an entry and preserve optional migration fields. */
  markProcessingStatus(filePath: string, status: ProcessingStatus, reason?: string): Promise<void>;
}
