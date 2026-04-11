import type { VerbatimEntry } from '../domain/verbatim-entry.js';
import type { FileInfo } from './file-store.js';

export interface IVerbatimStore {
  /** Write a VerbatimEntry to disk as markdown (serialization owned by infra). */
  writeEntry(entry: VerbatimEntry): Promise<void>;

  /** Find verbatim entries with consolidated: false for a given agent. */
  listUnconsolidated(agent: string): Promise<FileInfo[]>;

  /** Count unconsolidated entries across all agents. */
  countUnconsolidated(): Promise<number>;

  /** Load a single entry by relative path. Returns null if missing. */
  readEntry(filePath: string): Promise<VerbatimEntry | null>;

  /**
   * Flip the `consolidated` flag to `true` for the entry at `filePath`.
   * Idempotent: a no-op if already consolidated. Throws if the file does
   * not exist.
   */
  markConsolidated(filePath: string): Promise<void>;
}
