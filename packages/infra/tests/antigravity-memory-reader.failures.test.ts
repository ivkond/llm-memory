import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globby } from 'globby';
import { readFile, stat } from 'node:fs/promises';
import { AntigravityMemoryReader } from '../src/antigravity-memory-reader.js';

vi.mock('globby', () => ({
  globby: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  readFile: vi.fn(),
}));

describe('AntigravityMemoryReader failure handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('skips readFile failures best-effort without aborting discovery', async () => {
    const goodFile = '/tmp/workspace/.agents/rules/good.md';
    const badFile = '/tmp/workspace/.agents/rules/bad.md';

    vi.mocked(globby).mockResolvedValue([goodFile, badFile]);
    vi.mocked(stat).mockResolvedValue({ mtime: new Date('2026-04-10T00:00:00Z') } as never);
    vi.mocked(readFile).mockImplementation(async (filePath) => {
      if (filePath === badFile) throw new Error('EACCES');
      return '# good rule';
    });

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: ['/tmp/workspace/.agents/rules/**/*.md'],
      since: null,
    });

    expect(items).toHaveLength(1);
    expect(items[0].sourcePath).toBe(goodFile);
    expect(items[0].content).toBe('# good rule');
  });
});
