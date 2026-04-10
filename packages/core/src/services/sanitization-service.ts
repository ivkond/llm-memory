import { SanitizationResult } from '../domain/sanitization-result.js';
import type { RedactionWarning } from '../domain/sanitization-result.js';

export interface SanitizationConfig {
  enabled: boolean;
  mode: 'redact' | 'warn' | 'block';
  customPatterns?: string[];
  allowlist?: string[];
}

interface PatternRule {
  name: string;
  pattern: RegExp;
}

const DEFAULT_PATTERNS: PatternRule[] = [
  { name: 'private_key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'aws_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'github_token', pattern: /\b(ghp|gho|github_pat)_[A-Za-z0-9_]{30,}\b/g },
  { name: 'api_key', pattern: /\b(sk-|sk_live_|pk_live_)[A-Za-z0-9]{20,}\b/g },
  { name: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'connection_string', pattern: /\b(postgresql|mysql|mongodb|redis):\/\/[^\s]+:[^\s@]+@[^\s]+/g },
];

export class SanitizationService {
  private readonly patterns: PatternRule[];

  constructor(private readonly config: SanitizationConfig) {
    this.patterns = [...DEFAULT_PATTERNS];
    if (config.customPatterns) {
      for (const p of config.customPatterns) {
        this.patterns.push({ name: 'custom', pattern: new RegExp(p, 'g') });
      }
    }
  }

  sanitize(content: string): SanitizationResult {
    if (!this.config.enabled) {
      return new SanitizationResult(content, [], 0);
    }

    const warnings: RedactionWarning[] = [];
    let result = content;
    let totalRedactedLength = 0;

    for (const rule of this.patterns) {
      // Reset regex lastIndex for each run
      rule.pattern.lastIndex = 0;

      result = result.replace(rule.pattern, (match, ...args) => {
        const offset = typeof args[args.length - 2] === 'number' ? args[args.length - 2] : 0;
        warnings.push({
          type: rule.name,
          position: offset as number,
          original_length: match.length,
        });
        totalRedactedLength += match.length;
        return `[REDACTED:${rule.name}]`;
      });
    }

    const redactedRatio = content.length > 0 ? totalRedactedLength / content.length : 0;
    return new SanitizationResult(result, warnings, redactedRatio);
  }
}
