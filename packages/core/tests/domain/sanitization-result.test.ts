import { describe, it, expect } from 'vitest';
import { SanitizationResult } from '../../src/domain/sanitization-result.js';

describe('SanitizationResult', () => {
  it('test_isBlocked_over50percent_returnsTrue', () => {
    const result = new SanitizationResult('redacted', [{ type: 'api_key', position: 0, original_length: 100 }], 0.6);
    expect(result.isBlocked).toBe(true);
  });

  it('test_isBlocked_under50percent_returnsFalse', () => {
    const result = new SanitizationResult('mostly clean', [{ type: 'api_key', position: 5, original_length: 10 }], 0.1);
    expect(result.isBlocked).toBe(false);
  });

  it('test_isClean_noWarnings_returnsTrue', () => {
    const result = new SanitizationResult('clean content', [], 0);
    expect(result.isClean).toBe(true);
  });
});
