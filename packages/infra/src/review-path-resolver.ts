import path from 'node:path';
import { existsSync } from 'node:fs';

export function resolveConsolidationReviewDir(repoRoot: string): string {
  const trackedDir = path.join(repoRoot, 'review', 'consolidation');
  if (existsSync(trackedDir)) {
    return 'review/consolidation';
  }
  return '.local/review/consolidation';
}
