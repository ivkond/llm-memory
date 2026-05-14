import { describe, it, expect } from 'vitest';
import { SanitizationResult } from '../../src/domain/sanitization-result.js';

describe('SanitizationResult', () => {
  it.each([
    {
      content: 'redacted',
      warnings: [{ type: 'api_key', position: 0, original_length: 100 }],
      redactionRatio: 0.6,
      expected: true,
      name: 'over 50 percent',
    },
    {
      content: 'mostly clean',
      warnings: [{ type: 'api_key', position: 5, original_length: 10 }],
      redactionRatio: 0.1,
      expected: false,
      name: 'under 50 percent',
    },
  ])('test_isBlocked_$name_returns$expected', ({ content, warnings, redactionRatio, expected }) => {
    const result = new SanitizationResult(content, warnings, redactionRatio);
    expect(result.isBlocked).toBe(expected);
  });

  it('test_isClean_noWarnings_returnsTrue', () => {
    const result = new SanitizationResult('clean content', [], 0);
    expect(result.isClean).toBe(true);
  });
});
