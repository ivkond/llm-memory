import { describe, expect, it } from 'vitest';
import {
  OPERATION_STATUSES,
  OPERATION_TYPES,
  sanitizeOperationMetadata,
  transitionOperationStatus,
} from '../../src/domain/operation-journal.js';

describe('OperationJournalDomain', () => {
  it('test_operationTypeAndStatusConstants_includeRequiredValues', () => {
    expect(OPERATION_TYPES).toEqual([
      'remember_fact',
      'remember_session',
      'import',
      'ingest',
      'lint',
      'consolidate',
      'promote',
      'reindex',
      'archive',
    ]);
    expect(OPERATION_STATUSES).toEqual([
      'running',
      'succeeded',
      'failed',
      'interrupted',
      'blocked_or_conflict',
    ]);
  });

  it('test_transitionOperationStatus_runningToTerminal_allowed', () => {
    expect(transitionOperationStatus('running', 'succeeded')).toBe('succeeded');
  });

  it('test_transitionOperationStatus_terminalToDifferent_throws', () => {
    expect(() => transitionOperationStatus('failed', 'succeeded')).toThrow(
      'Invalid operation status transition',
    );
  });

  it('test_sanitizeOperationMetadata_filtersUnsafeRequestFields', () => {
    const sanitized = sanitizeOperationMetadata({
      request: {
        requestId: 'req-1',
        source: 'cli',
        actor: 'forge',
        idempotencyKey: 'idem-1',
        // Ensure unknown request fields never persist.
        ...({ prompt: 'never persist prompt text' } as Record<string, string>),
      },
      touchedPaths: ['wiki/facts/a.md', '', 'wiki/facts/a.md'],
      disabledReason: 'manual disable',
      resumeReason: 'recovered after restart',
    });
    expect(sanitized.request).toEqual({
      requestId: 'req-1',
      source: 'cli',
      actor: 'forge',
      idempotencyKey: 'idem-1',
    });
    expect('prompt' in (sanitized.request ?? {})).toBe(false);
    expect(sanitized.touchedPaths).toEqual(['wiki/facts/a.md']);
    expect(sanitized.disabledReason).toBe('manual disable');
    expect(sanitized.resumeReason).toBe('recovered after restart');
  });

  it('test_sanitizeOperationMetadata_redactsSecretsInErrorAndReasons', () => {
    const sanitized = sanitizeOperationMetadata({
      touchedPaths: [],
      error: {
        name: 'SomeError',
        message:
          'prompt leaked sk-abc123def456ghi789jkl012mno345pqr678 and aws AKIAIOSFODNN7EXAMPLE',
      },
      disabledReason: 'failed with token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
      resumeReason: 'retry with db://user:s3cretPass@localhost:5432/app',
    });

    expect(sanitized.error?.message).toContain('[REDACTED_SECRET]');
    expect(sanitized.error?.message).not.toContain('sk-abc123def456ghi789jkl012mno345pqr678');
    expect(sanitized.error?.message).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(sanitized.disabledReason).toContain('[REDACTED_SECRET]');
    expect(sanitized.disabledReason).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
    expect(sanitized.resumeReason).toContain('[REDACTED_SECRET]');
    expect(sanitized.resumeReason).not.toContain('s3cretPass');
  });
});
