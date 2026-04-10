import { describe, it, expect } from 'vitest';
import { VerbatimEntry } from '../../src/domain/verbatim-entry.js';
import { InvalidIdentifierError } from '../../src/domain/errors.js';

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

  describe('identifier validation', () => {
    const baseOpts = { content: 'x', agent: 'claude-code', sessionId: 'abc' };

    it('test_create_agentWithSlash_throwsInvalidIdentifier', () => {
      expect(() => VerbatimEntry.create({ ...baseOpts, agent: '../other' })).toThrow(
        InvalidIdentifierError,
      );
    });

    it('test_create_agentWithDotDot_throwsInvalidIdentifier', () => {
      expect(() => VerbatimEntry.create({ ...baseOpts, agent: '..' })).toThrow(
        InvalidIdentifierError,
      );
    });

    it('test_create_sessionIdWithSlash_throwsInvalidIdentifier', () => {
      expect(() => VerbatimEntry.create({ ...baseOpts, sessionId: 'abc/def' })).toThrow(
        InvalidIdentifierError,
      );
    });

    it('test_create_emptyAgent_throwsInvalidIdentifier', () => {
      expect(() => VerbatimEntry.create({ ...baseOpts, agent: '' })).toThrow(
        InvalidIdentifierError,
      );
    });

    it('test_create_agentWithBackslash_throwsInvalidIdentifier', () => {
      expect(() => VerbatimEntry.create({ ...baseOpts, agent: 'evil\\agent' })).toThrow(
        InvalidIdentifierError,
      );
    });

    it('test_create_agentStartingWithDash_throwsInvalidIdentifier', () => {
      // First character must be alphanumeric (prevents CLI-style arg confusion).
      expect(() => VerbatimEntry.create({ ...baseOpts, agent: '-evil' })).toThrow(
        InvalidIdentifierError,
      );
    });

    it('test_create_agentExceeds64Chars_throwsInvalidIdentifier', () => {
      expect(() => VerbatimEntry.create({ ...baseOpts, agent: 'a'.repeat(65) })).toThrow(
        InvalidIdentifierError,
      );
    });

    it('test_create_validSlugStyleIdentifiers_work', () => {
      // Common legitimate shapes must still pass.
      const entry = VerbatimEntry.create({
        ...baseOpts,
        agent: 'claude-code',
        sessionId: 'session_2026-04-10',
      });
      expect(entry.agent).toBe('claude-code');
      expect(entry.sessionId).toBe('session_2026-04-10');
    });

    it('test_fromParsedData_invalidAgent_throwsInvalidIdentifier', () => {
      expect(() =>
        VerbatimEntry.fromParsedData('2026-04-10-abc-1111.md', {
          session: 'abc',
          agent: '../hostile',
          consolidated: false,
          created: '2026-04-10T00:00:00Z',
          content: 'x',
        }),
      ).toThrow(InvalidIdentifierError);
    });
  });
});
