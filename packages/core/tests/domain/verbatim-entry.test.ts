import { describe, it, expect } from 'vitest';
import { VerbatimEntry } from '../../src/domain/verbatim-entry.js';

describe('VerbatimEntry', () => {
  it('test_create_withRequiredFields_generatesUniqueFilename', () => {
    const entry = VerbatimEntry.create({
      content: '- pgx pool MaxConns <= max_connections/3',
      agent: 'claude-code',
      project: 'cli-relay',
      sessionId: 'abc123',
    });

    expect(entry.agent).toBe('claude-code');
    expect(entry.project).toBe('cli-relay');
    expect(entry.sessionId).toBe('abc123');
    expect(entry.consolidated).toBe(false);
    expect(entry.content).toContain('pgx pool MaxConns');
    expect(entry.filename).toMatch(/^\d{4}-\d{2}-\d{2}-abc123-[a-f0-9]+\.md$/);
  });

  it('test_create_twoEntries_differentFilenames', () => {
    const opts = {
      content: 'fact',
      agent: 'claude-code',
      sessionId: 'abc',
    };
    const a = VerbatimEntry.create(opts);
    const b = VerbatimEntry.create(opts);
    expect(a.filename).not.toBe(b.filename);
  });

  it('test_toData_serializesCorrectly', () => {
    const entry = VerbatimEntry.create({
      content: '- Test fact\n- Another fact',
      agent: 'claude-code',
      project: 'cli-relay',
      sessionId: 'abc123',
    });
    const data = entry.toData();

    expect(data.session).toBe('abc123');
    expect(data.project).toBe('cli-relay');
    expect(data.agent).toBe('claude-code');
    expect(data.consolidated).toBe(false);
    expect(data.content).toContain('- Test fact');
    expect(data.content).toContain('- Another fact');
  });

  it('test_fromParsedData_roundtrip_preservesData', () => {
    const entry = VerbatimEntry.create({
      content: '- Fact here',
      agent: 'cursor',
      sessionId: 'xyz',
    });
    const data = entry.toData();
    const parsed = VerbatimEntry.fromParsedData(entry.filename, data);

    expect(parsed.agent).toBe('cursor');
    expect(parsed.sessionId).toBe('xyz');
    expect(parsed.consolidated).toBe(false);
    expect(parsed.content).toContain('Fact here');
  });

  it('test_filePath_includesAgentDirectory', () => {
    const entry = VerbatimEntry.create({
      content: 'fact',
      agent: 'claude-code',
      sessionId: 'abc',
    });
    expect(entry.filePath).toBe(`log/claude-code/raw/${entry.filename}`);
  });
});
