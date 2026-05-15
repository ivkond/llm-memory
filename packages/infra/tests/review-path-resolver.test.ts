import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveConsolidationReviewDir } from '../src/review-path-resolver.js';

describe('resolveConsolidationReviewDir', () => {
  it('defaults to .local review queue path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'review-path-'));
    try {
      expect(resolveConsolidationReviewDir(root)).toBe('.local/review/consolidation');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses tracked review directory when present and local is absent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'review-path-'));
    try {
      await mkdir(path.join(root, 'review', 'consolidation'), { recursive: true });
      expect(resolveConsolidationReviewDir(root)).toBe('review/consolidation');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses tracked review directory when both tracked and local directories exist', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'review-path-'));
    try {
      await mkdir(path.join(root, 'review', 'consolidation'), { recursive: true });
      await mkdir(path.join(root, '.local', 'review', 'consolidation'), { recursive: true });
      expect(resolveConsolidationReviewDir(root)).toBe('review/consolidation');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
