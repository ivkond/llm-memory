import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

export interface WikiConfig {
  wiki: { path: string };
  llm: { provider: string; model: string; base_url: string | null; api_key: string | null };
  embedding: { provider: string; model: string; base_url: string | null; api_key: string | null };
  search: { db_path: string; rerank: boolean; cascade_threshold: number };
  git: { auto_commit: boolean; squash_on_lint: boolean; worktree_for_lint: boolean };
  consolidation: {
    batch_threshold: number;
    archive_after_days: number;
    archive_retention_months: number;
  };
  sanitization: {
    enabled: boolean;
    mode: 'redact' | 'warn' | 'block';
    custom_patterns: string[];
    allowlist: string[];
  };
  mcp: { host: string; port: number };
  import_sources: Record<string, { enabled: boolean; paths: string[] }>;
}

const DEFAULTS: WikiConfig = {
  wiki: { path: '~/.llm-wiki' },
  llm: { provider: 'openai', model: 'gpt-4o-mini', base_url: null, api_key: null },
  embedding: { provider: 'openai', model: 'text-embedding-3-small', base_url: null, api_key: null },
  search: { db_path: '.local/search.db', rerank: false, cascade_threshold: 0.3 },
  git: { auto_commit: true, squash_on_lint: true, worktree_for_lint: true },
  consolidation: { batch_threshold: 10, archive_after_days: 30, archive_retention_months: 6 },
  sanitization: { enabled: true, mode: 'redact', custom_patterns: [], allowlist: [] },
  mcp: { host: '127.0.0.1', port: 7849 },
  import_sources: {
    'claude-code': { enabled: false, paths: [] },
    amp: { enabled: false, paths: [] },
  },
};

interface EnvEntry {
  path: [string, string];
  coerce?: (raw: string) => unknown;
}

/**
 * Validates `LLM_WIKI_MCP_PORT` and YAML `mcp.port` values.
 * Coerces to integer in [1, 65535]; throws otherwise. Defense-in-depth so
 * the WikiConfig.port type contract (`number`) is honoured regardless of the
 * source (env var string, YAML-quoted string, unquoted YAML number).
 */
function coercePort(raw: string | number): number {
  const asString = typeof raw === 'number' ? String(raw) : raw;
  if (!/^-?\d+$/.test(asString)) {
    throw new Error(`Invalid LLM_WIKI_MCP_PORT: "${asString}" — must be integer in range 1-65535`);
  }
  const n = Number(asString);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid LLM_WIKI_MCP_PORT: "${asString}" — must be integer in range 1-65535`);
  }
  return n;
}

export class ConfigLoader {
  constructor(private readonly wikiRoot: string) {}

  async load(): Promise<WikiConfig> {
    const shared = await this.loadYaml('.config/settings.shared.yaml');
    const local = await this.loadYaml('.local/settings.local.yaml');
    const envOverrides = this.loadEnvOverrides();
    const defaultsAsRecord = DEFAULTS as unknown as Record<string, unknown>;
    const merged = this.deepMerge(
      defaultsAsRecord,
      shared,
      local,
      envOverrides,
    ) as unknown as WikiConfig;

    // Coerce YAML-sourced mcp.port (may arrive as string under YAML quoting)
    // into the number contract. Env-sourced port was already coerced in
    // loadEnvOverrides, but idempotent coercion is safe.
    merged.mcp = {
      host: String(merged.mcp.host),
      port: coercePort(merged.mcp.port as unknown as string | number),
    };

    return merged;
  }

  private loadEnvOverrides(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const envMap: Record<string, EnvEntry> = {
      LLM_WIKI_LLM_API_KEY: { path: ['llm', 'api_key'] },
      LLM_WIKI_LLM_MODEL: { path: ['llm', 'model'] },
      LLM_WIKI_LLM_BASE_URL: { path: ['llm', 'base_url'] },
      LLM_WIKI_EMBEDDING_API_KEY: { path: ['embedding', 'api_key'] },
      LLM_WIKI_EMBEDDING_MODEL: { path: ['embedding', 'model'] },
      LLM_WIKI_EMBEDDING_BASE_URL: { path: ['embedding', 'base_url'] },
      LLM_WIKI_PATH: { path: ['wiki', 'path'] },
      LLM_WIKI_MCP_HOST: { path: ['mcp', 'host'] },
      LLM_WIKI_MCP_PORT: { path: ['mcp', 'port'], coerce: coercePort },
    };

    for (const [envKey, entry] of Object.entries(envMap)) {
      const value = process.env[envKey];
      if (value !== undefined) {
        const [section, field] = entry.path;
        if (!result[section]) result[section] = {};
        const coerced = entry.coerce ? entry.coerce(value) : value;
        (result[section] as Record<string, unknown>)[field] = coerced;
      }
    }
    return result;
  }

  private async loadYaml(relativePath: string): Promise<Record<string, unknown>> {
    try {
      const content = await readFile(path.join(this.wikiRoot, relativePath), 'utf-8');
      return (yaml.load(content) as Record<string, unknown>) ?? {};
    } catch {
      return {};
    }
  }

  private deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          result[key] !== null &&
          typeof result[key] === 'object' &&
          !Array.isArray(result[key])
        ) {
          result[key] = this.deepMerge(
            result[key] as Record<string, unknown>,
            value as Record<string, unknown>,
          );
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  }
}
