import type { IndexHealth } from '../../src/ports/index.js';

type IndexSnapshot = {
  health: IndexHealth;
  bm25Paths: string[];
  vectorPaths: string[];
  indexedAt: Record<string, string>;
  metadataCorrupted: boolean;
};

export function emptyIndexSnapshot(health: IndexHealth = 'ok'): IndexSnapshot {
  return {
    health,
    bm25Paths: [],
    vectorPaths: [],
    indexedAt: {},
    metadataCorrupted: false,
  };
}

export function indexSnapshotFromLastIndexedMap(
  lastIndexedMap: Record<string, string | null>,
  health: IndexHealth = 'ok',
): IndexSnapshot {
  const indexedAt: Record<string, string> = {};
  for (const [path, ts] of Object.entries(lastIndexedMap)) {
    if (ts) indexedAt[path] = ts;
  }
  const paths = Object.keys(indexedAt);
  return {
    health,
    bm25Paths: paths,
    vectorPaths: paths,
    indexedAt,
    metadataCorrupted: false,
  };
}
