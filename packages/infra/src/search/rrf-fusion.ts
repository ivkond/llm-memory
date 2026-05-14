import type { SearchSource } from '@ivkond-llm-wiki/core';
import type { DocFields } from './bm25-index-store.js';

const RRF_K = 60;

export interface DenseHit {
  metadata?: Partial<DocFields>;
}

export interface FusedResult {
  path: string;
  title: string;
  content: string;
  score: number;
  source: SearchSource;
}

export function fuseSearchResults(params: {
  denseRaw: DenseHit[];
  sparseRaw: Array<Record<string, unknown>>;
  maxResults: number;
  scope?: string;
}): FusedResult[] {
  const { denseRaw, sparseRaw, maxResults, scope } = params;
  const inScope = (p: string): boolean => (scope ? p.startsWith(scope) : true);

  interface FusionEntry {
    rankDense: number | null;
    rankSparse: number | null;
    path: string;
    title: string;
    content: string;
  }

  const fused = new Map<string, FusionEntry>();

  let denseRank = 0;
  for (const r of denseRaw) {
    const meta = r.metadata;
    if (!meta?.path) continue;
    if (!inScope(meta.path)) continue;
    denseRank += 1;
    fused.set(meta.path, {
      rankDense: denseRank,
      rankSparse: null,
      path: meta.path,
      title: meta.title ?? meta.path,
      content: meta.content ?? '',
    });
  }

  let sparseRank = 0;
  for (const r of sparseRaw) {
    const docPath = (r.path as string | undefined) ?? (r.id as string);
    if (!inScope(docPath)) continue;
    sparseRank += 1;
    const existing = fused.get(docPath);
    if (existing) {
      existing.rankSparse = sparseRank;
    } else {
      fused.set(docPath, {
        rankDense: null,
        rankSparse: sparseRank,
        path: docPath,
        title: (r.title as string | undefined) ?? docPath,
        content: (r.content as string | undefined) ?? '',
      });
    }
  }

  if (fused.size === 0) return [];

  const scored = Array.from(fused.values()).map((entry) => {
    const dScore = entry.rankDense !== null ? 1 / (RRF_K + entry.rankDense) : 0;
    const sScore = entry.rankSparse !== null ? 1 / (RRF_K + entry.rankSparse) : 0;
    const fusedScore = dScore + sScore;
    const source: SearchSource =
      entry.rankDense !== null && entry.rankSparse !== null
        ? 'hybrid'
        : entry.rankDense !== null
          ? 'vector'
          : 'bm25';
    return { entry, fusedScore, source };
  });

  scored.sort((a, b) => b.fusedScore - a.fusedScore);
  const top = scored[0].fusedScore || 1;

  return scored.slice(0, maxResults).map(({ entry, fusedScore, source }) => ({
    path: entry.path,
    title: entry.title,
    content: entry.content,
    score: top > 0 ? fusedScore / top : 0,
    source,
  }));
}
