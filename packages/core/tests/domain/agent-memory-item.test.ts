import { describe, it, expect } from 'vitest';
import { AgentMemoryItem } from '../../src/domain/agent-memory-item.js';

describe('AgentMemoryItem', () => {
  it('captures source path, session, project, content, and mtime', () => {
    const item = AgentMemoryItem.create({
      agent: 'claude-code',
      sourcePath: '/home/me/.claude/projects/abc/memory/2026-04-09.md',
      sessionId: 'sess42',
      project: 'cli-relay',
      content: 'fact a\nfact b',
      mtime: '2026-04-09T14:00:00Z',
    });
    expect(item.agent).toBe('claude-code');
    expect(item.sessionId).toBe('sess42');
    expect(item.project).toBe('cli-relay');
    expect(item.content).toBe('fact a\nfact b');
    expect(item.mtime).toBe('2026-04-09T14:00:00Z');
    expect(item.sourceUri).toBe('/home/me/.claude/projects/abc/memory/2026-04-09.md');
    expect(item.sourceType).toBe('claude-code');
  });

  it('accepts digest-based identity when mtime is unavailable', () => {
    const item = AgentMemoryItem.create({
      agent: 'claude-code',
      sourcePath: '/x/y.md',
      sourceUri: 'claude://memory/y',
      sourceDigest: 'abc123',
      sessionId: 'sess',
      content: 'fact',
    });
    expect(item.sourceDigest).toBe('abc123');
    expect(item.dedupeKey).toContain('abc123');
  });

  it('normalises sessionId to the same regex as VerbatimEntry identifiers', () => {
    expect(() =>
      AgentMemoryItem.create({
        agent: 'claude-code',
        sourcePath: '/x/y.md',
        sessionId: '../escape',
        content: 'c',
        mtime: '2026-04-09T00:00:00Z',
      }),
    ).toThrow(/sessionId/);
  });

  it('agent identifier must also be safe', () => {
    expect(() =>
      AgentMemoryItem.create({
        agent: 'claude code',
        sourcePath: '/x/y.md',
        sessionId: 's',
        content: 'c',
        mtime: '2026-04-09T00:00:00Z',
      }),
    ).toThrow(/agent/);
  });

  it('requires either mtime or sourceDigest', () => {
    expect(() =>
      AgentMemoryItem.create({
        agent: 'claude-code',
        sourcePath: '/x/y.md',
        sessionId: 's',
        content: 'c',
      }),
    ).toThrow(/mtime or sourceDigest/);
  });
});
