import RE2 from 're2';
import { SanitizationResult } from '../domain/sanitization-result.js';
import type { RedactionWarning } from '../domain/sanitization-result.js';
import { InvalidPatternError } from '../domain/errors.js';

export interface SanitizationConfig {
  enabled: boolean;
  /** 'redact' replaces matches with placeholders, 'warn' keeps content but reports warnings,
   *  'block' forces SanitizationResult.isBlocked = true whenever any pattern matches. */
  mode: 'redact' | 'warn' | 'block';
  customPatterns?: string[];
  /** Substrings that, when present in a match, exempt it from redaction
   *  (e.g. 'localhost' to preserve local connection strings). */
  allowlist?: string[];
}

// RE2 instances are API-compatible with RegExp for the methods we use
// (lastIndex, and String.prototype.replace). The wider type lets us keep
// the default patterns as native RegExp while user-supplied custom patterns
// compile through RE2 so they can never cause catastrophic backtracking.
type CompiledPattern = RegExp | RE2;

interface PatternRule {
  name: string;
  pattern: CompiledPattern;
}

/** Hard cap on user-supplied pattern length. Defense-in-depth next to RE2. */
const MAX_CUSTOM_PATTERN_LENGTH = 512;

const DEFAULT_PATTERNS: PatternRule[] = [
  {
    name: 'private_key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { name: 'aws_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'github_token', pattern: /\b(ghp|gho|github_pat)_[A-Za-z0-9_]{30,}\b/g },
  { name: 'api_key', pattern: /\b(sk-|sk_live_|pk_live_)[A-Za-z0-9]{20,}\b/g },
  { name: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    name: 'connection_string',
    // [^\s:]+ (not [^\s]+) in the username slot: disjoint from the
    // following ':' and from [^\s@]+ in the password slot, so there's
    // no overlapping quantifier pair the regex engine can backtrack
    // across. Keeps the pattern linear and satisfies typescript:S5852.
    pattern: /\b(postgresql|mysql|mongodb|redis):\/\/[^\s:]+:[^\s@]+@[^\s]+/g,
  },
];

export class SanitizationService {
  private readonly patterns: PatternRule[];

  constructor(private readonly config: SanitizationConfig) {
    this.patterns = [...DEFAULT_PATTERNS];
    if (config.customPatterns) {
      for (const p of config.customPatterns) {
        this.patterns.push({ name: 'custom', pattern: this.compileCustomPattern(p) });
      }
    }
  }

  /**
   * Compile a user-supplied pattern through RE2 so it executes in guaranteed
   * linear time. RE2 rejects patterns it cannot handle (e.g. backreferences,
   * lookaheads) — we surface that as a domain error instead of letting a
   * shared config break the whole sanitizer.
   */
  private compileCustomPattern(source: string): RE2 {
    if (source.length > MAX_CUSTOM_PATTERN_LENGTH) {
      throw new InvalidPatternError(
        source,
        `pattern exceeds max length of ${MAX_CUSTOM_PATTERN_LENGTH} characters`,
      );
    }
    try {
      return new RE2(source, 'g');
    } catch (err) {
      throw new InvalidPatternError(source, (err as Error).message);
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
        // Skip matches that are covered by the allowlist
        if (this.isAllowed(match)) {
          return match;
        }

        const offset = typeof args[args.length - 2] === 'number' ? args[args.length - 2] : 0;
        warnings.push({
          type: rule.name,
          position: offset as number,
          original_length: match.length,
        });
        totalRedactedLength += match.length;

        // warn mode: keep original content, only collect warnings
        if (this.config.mode === 'warn') {
          return match;
        }

        return `[REDACTED:${rule.name}]`;
      });
    }

    // warn mode: no content modification, no blocking
    if (this.config.mode === 'warn') {
      return new SanitizationResult(content, warnings, 0);
    }

    // block mode: any match forces the result to be blocked
    if (this.config.mode === 'block' && warnings.length > 0) {
      return new SanitizationResult(result, warnings, 1);
    }

    const redactedRatio = content.length > 0 ? totalRedactedLength / content.length : 0;
    return new SanitizationResult(result, warnings, redactedRatio);
  }

  private isAllowed(match: string): boolean {
    if (!this.config.allowlist || this.config.allowlist.length === 0) return false;
    return this.config.allowlist.some((allowed) => match.includes(allowed));
  }
}
