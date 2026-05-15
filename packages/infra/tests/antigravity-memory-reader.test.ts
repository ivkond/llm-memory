import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AntigravityMemoryReader } from '../src/antigravity-memory-reader.js';

describe('AntigravityMemoryReader', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'ag-reader-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeRule(rel: string, body: string, mtime?: Date): Promise<string> {
    const file = path.join(root, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    if (mtime) await utimes(file, mtime, mtime);
    return file;
  }

  function antigravityGlobs(): string[] {
    return [
      path.join(root, '.agents', 'rules', '**', '*.md').replaceAll('\\', '/'),
      path.join(root, '.agent', 'rules', '**', '*.md').replaceAll('\\', '/'),
    ];
  }

  it('discovers modern and legacy workspace rules recursively', async () => {
    await writeRule('.agents/rules/frontend/typescript.md', '# TS rule\n', new Date('2026-04-09T10:00:00Z'));
    await writeRule('.agent/rules/legacy.md', '# Legacy rule\n', new Date('2026-04-09T11:00:00Z'));

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({ paths: antigravityGlobs(), since: null });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.agent)).toEqual(['antigravity', 'antigravity']);
    expect(items.map((i) => i.sessionId).sort()).toEqual(['frontend-typescript', 'legacy']);
  });

  it('preserves raw markdown including frontmatter and @filename text', async () => {
    const raw = '---\nmode: always\n---\n\nUse @other-rule.md literally.\n';
    await writeRule('.agents/rules/always-on.md', raw, new Date('2026-04-09T10:00:00Z'));

    const reader = new AntigravityMemoryReader();
    const [item] = await reader.discover({ paths: antigravityGlobs(), since: null });

    expect(item.content).toBe(raw);
    expect(item.content).toContain('@other-rule.md');
  });

  it('ignores non-md files and skill files by default globs', async () => {
    await writeRule('.agents/rules/rule.md', '# keep\n', new Date('2026-04-09T10:00:00Z'));
    await writeRule('.agents/rules/ignore.txt', 'skip\n', new Date('2026-04-09T10:01:00Z'));
    await writeRule('.agents/skills/example/SKILL.md', '# skill\n', new Date('2026-04-09T10:02:00Z'));

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({ paths: antigravityGlobs(), since: null });

    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('rule');
  });

  it('respects since filtering and skips empty files', async () => {
    await writeRule('.agents/rules/old.md', '# old\n', new Date('2026-04-01T00:00:00Z'));
    await writeRule('.agents/rules/new.md', '# new\n', new Date('2026-04-10T00:00:00Z'));
    await writeRule('.agents/rules/empty.md', '   \n', new Date('2026-04-10T00:00:01Z'));

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: antigravityGlobs(),
      since: '2026-04-05T00:00:00Z',
    });

    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('new');
  });

  it('returns empty on missing directories', async () => {
    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({ paths: antigravityGlobs(), since: null });
    expect(items).toEqual([]);
  });

  it('uses hash fallback for unsafe or long identifiers', async () => {
    const longName = `${'very-long-rule-name-'.repeat(4)}$${'x'.repeat(20)}.md`;
    await writeRule(`.agents/rules/nested/%%%/${longName}`, '# long\n');

    const reader = new AntigravityMemoryReader();
    const [item] = await reader.discover({ paths: antigravityGlobs(), since: null });

    expect(item.sessionId).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
    expect(item.sessionId.length).toBeLessThanOrEqual(64);
  });
});
