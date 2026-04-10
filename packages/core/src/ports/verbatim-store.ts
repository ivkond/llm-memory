import type { VerbatimEntry } from '../domain/verbatim-entry.js';
import type { FileInfo } from './file-store.js';

export interface IVerbatimStore {
  /** Write a VerbatimEntry to disk as markdown (serialization owned by infra). */
  writeEntry(entry: VerbatimEntry): Promise<void>;

  /** Find verbatim entries with consolidated: false for a given agent. */
  listUnconsolidated(agent: string): Promise<FileInfo[]>;

  /** Count unconsolidated entries across all agents. */
  countUnconsolidated(): Promise<number>;
}
