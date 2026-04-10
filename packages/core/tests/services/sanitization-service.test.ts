import { describe, it, expect } from 'vitest';
import { SanitizationService } from '../../src/services/sanitization-service.js';

describe('SanitizationService', () => {
  const service = new SanitizationService({ enabled: true, mode: 'redact' });

  it('test_sanitize_awsKey_redactsCorrectly', () => {
    const result = service.sanitize('My key is AKIAIOSFODNN7EXAMPLE and more text');
    expect(result.content).toContain('[REDACTED:aws_key]');
    expect(result.content).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('aws_key');
  });

  it('test_sanitize_githubToken_redactsCorrectly', () => {
    const result = service.sanitize('Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
    expect(result.content).toContain('[REDACTED:github_token]');
    expect(result.content).not.toContain('ghp_');
  });

  it('test_sanitize_genericApiKey_redactsCorrectly', () => {
    const result = service.sanitize('API key: sk-abc123def456ghi789jkl012mno345pqr678');
    expect(result.content).toContain('[REDACTED:api_key]');
  });

  it('test_sanitize_jwtToken_redactsCorrectly', () => {
    const result = service.sanitize('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
    expect(result.content).toContain('[REDACTED:jwt]');
  });

  it('test_sanitize_privateKey_redactsCorrectly', () => {
    const result = service.sanitize('Key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----');
    expect(result.content).toContain('[REDACTED:private_key]');
  });

  it('test_sanitize_connectionString_redactsPassword', () => {
    const result = service.sanitize('DB: postgresql://user:s3cretP@ss@localhost:5432/mydb');
    expect(result.content).toContain('[REDACTED:connection_string]');
    expect(result.content).not.toContain('s3cretP@ss');
  });

  it('test_sanitize_cleanContent_returnsUnchanged', () => {
    const content = 'This is normal technical content about PostgreSQL connection pooling.';
    const result = service.sanitize(content);
    expect(result.content).toBe(content);
    expect(result.isClean).toBe(true);
  });

  it('test_sanitize_disabledMode_returnsUnchanged', () => {
    const disabled = new SanitizationService({ enabled: false, mode: 'redact' });
    const content = 'Key: sk-abc123def456ghi789jkl012mno345pqr678';
    const result = disabled.sanitize(content);
    expect(result.content).toBe(content);
  });

  it('test_sanitize_majorityRedacted_blocksContent', () => {
    const content = 'sk-key1abc123def456ghi789jkl sk-key2abc123def456ghi789jkl sk-key3abc123def456ghi789jkl';
    const result = service.sanitize(content);
    expect(result.isBlocked).toBe(true);
  });

  it('test_sanitize_multiplePatterns_redactsAll', () => {
    const content = 'AWS: AKIAIOSFODNN7EXAMPLE, GitHub: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const result = service.sanitize(content);
    expect(result.content).toContain('[REDACTED:aws_key]');
    expect(result.content).toContain('[REDACTED:github_token]');
    expect(result.warnings).toHaveLength(2);
  });

  it('test_sanitize_warnMode_keepsContent_butReportsWarnings', () => {
    const warnService = new SanitizationService({ enabled: true, mode: 'warn' });
    const content = 'Found AWS key AKIAIOSFODNN7EXAMPLE in log';
    const result = warnService.sanitize(content);
    expect(result.content).toBe(content);
    expect(result.content).not.toContain('[REDACTED');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('aws_key');
    expect(result.isBlocked).toBe(false);
  });

  it('test_sanitize_blockMode_anyMatch_setsBlocked', () => {
    const blockService = new SanitizationService({ enabled: true, mode: 'block' });
    const content = 'Mostly normal text with one small AKIAIOSFODNN7EXAMPLE token inside a very long document that is otherwise entirely safe and harmless';
    const result = blockService.sanitize(content);
    expect(result.warnings).toHaveLength(1);
    expect(result.isBlocked).toBe(true);
  });

  it('test_sanitize_blockMode_noMatch_notBlocked', () => {
    const blockService = new SanitizationService({ enabled: true, mode: 'block' });
    const result = blockService.sanitize('Perfectly safe content.');
    expect(result.warnings).toHaveLength(0);
    expect(result.isBlocked).toBe(false);
  });

  it('test_sanitize_allowlist_skipsLocalhostConnectionString', () => {
    const allowedService = new SanitizationService({
      enabled: true,
      mode: 'redact',
      allowlist: ['localhost'],
    });
    const content = 'DB: postgresql://user:s3cretP@ss@localhost:5432/mydb';
    const result = allowedService.sanitize(content);
    expect(result.content).toBe(content);
    expect(result.warnings).toHaveLength(0);
  });

  it('test_sanitize_allowlist_doesNotSkipNonMatching', () => {
    const allowedService = new SanitizationService({
      enabled: true,
      mode: 'redact',
      allowlist: ['localhost'],
    });
    const content = 'DB: postgresql://user:s3cretP@ss@prod.example.com:5432/mydb';
    const result = allowedService.sanitize(content);
    expect(result.content).toContain('[REDACTED:connection_string]');
  });
});
