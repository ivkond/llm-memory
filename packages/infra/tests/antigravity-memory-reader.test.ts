import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
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

  async function writeRule(relPath: string, body: string, mtime?: Date): Promise<string> {
    const file = path.join(root, relPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, 'utf8');
    if (mtime) await utimes(file, mtime, mtime);
    return file;
  }

  it('discovers .agents and legacy .agent markdown rules recursively', async () => {
    await writeRule('.agents/rules/team/a.md', '# A\n', new Date('2026-04-09T10:00:00Z'));
    await writeRule('.agent/rules/legacy/b.md', '# B\n', new Date('2026-04-09T11:00:00Z'));

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: [
        path.join(root, '.agents', 'rules', '**', '*.md').replaceAll('\\', '/'),
        path.join(root, '.agent', 'rules', '**', '*.md').replaceAll('\\', '/'),
      ],
      since: null,
    });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.sessionId).sort()).toEqual(['legacy-b', 'team-a']);
    expect(items.every((i) => i.agent === 'antigravity')).toBe(true);
  });

  it('ignores non-md and skills files when using default workspace globs', async () => {
    await writeRule('.agents/rules/ok.md', 'ok');
    await writeRule('.agents/rules/skip.txt', 'nope');
    await writeRule('.agents/skills/skill.md', 'nope');

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: [
        path.join(root, '.agents', 'rules', '**', '*.md').replaceAll('\\', '/'),
        path.join(root, '.agent', 'rules', '**', '*.md').replaceAll('\\', '/'),
      ],
      since: null,
    });

    expect(items).toHaveLength(1);
    expect(items[0].content).toBe('ok');
  });

  it('returns empty for missing directories', async () => {
    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, '.agents', 'rules', '**', '*.md').replaceAll('\\', '/')],
      since: null,
    });
    expect(items).toEqual([]);
  });

  it('skips stat-failed files best-effort', async () => {
    const readable = await writeRule('.agents/rules/ok.md', 'ok');
    await symlink(
      path.join(root, '.agents', 'rules', 'missing.md'),
      path.join(root, '.agents', 'rules', 'broken-link.md'),
    );

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, '.agents', 'rules', '**', '*.md').replaceAll('\\', '/')],
      since: null,
    });

    expect(items).toHaveLength(1);
    expect(items[0].sourcePath).toBe(readable);
  });

  it('respects since filtering', async () => {
    await writeRule('.agents/rules/old.md', 'old', new Date('2026-03-01T00:00:00Z'));
    await writeRule('.agents/rules/new.md', 'new', new Date('2026-04-10T00:00:00Z'));

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, '.agents', 'rules', '**', '*.md').replaceAll('\\', '/')],
      since: '2026-04-01T00:00:00Z',
    });

    expect(items).toHaveLength(1);
    expect(items[0].content).toBe('new');
  });

  it('preserves raw markdown and does not dereference @filename text', async () => {
    const raw = '---\ntitle: keep\n---\n\nPlease see @other-rule.md\n';
    await writeRule('.agents/rules/raw.md', raw, new Date('2026-04-10T00:00:00Z'));

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, '.agents', 'rules', '**', '*.md').replaceAll('\\', '/')],
      since: null,
    });

    expect(items).toHaveLength(1);
    expect(items[0].content).toBe(raw);
    expect(items[0].content).toContain('@other-rule.md');
  });

  it('derives nested session ids from relative rule paths', async () => {
    await writeRule('.agents/rules/a/b/c.md', 'nested');

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, '.agents', 'rules', '**', '*.md').replaceAll('\\', '/')],
      since: null,
    });

    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('a-b-c');
  });

  it('uses hash fallback for unsafe or long derived ids', async () => {
    const longName = `${'x'.repeat(140)}.md`;
    await writeRule(`.agents/rules/${longName}`, 'long');
    await writeRule('.agents/rules/[]bad name!!.md', 'unsafe');

    const reader = new AntigravityMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, '.agents', 'rules', '**', '*.md').replaceAll('\\', '/')],
      since: null,
    });

    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.sessionId).toMatch(/^ag-[a-f0-9]{8}$/);
    }
  });
});
