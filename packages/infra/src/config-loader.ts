import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

export interface WikiConfig {
  wiki: { path: string };
  llm: { provider: string; model: string; base_url: string | null; api_key: string | null };
  embedding: { provider: string; model: string; base_url: string | null; api_key: string | null };
  search: { db_path: string; rerank: boolean; cascade_threshold: number };
  git: { auto_commit: boolean; squash_on_lint: boolean; worktree_for_lint: boolean };
  consolidation: { batch_threshold: number; archive_after_days: number; archive_retention_months: number };
  sanitization: { enabled: boolean; mode: 'redact' | 'warn' | 'block'; custom_patterns: string[]; allowlist: string[] };
}

const DEFAULTS: WikiConfig = {
  wiki: { path: '~/.llm-wiki' },
  llm: { provider: 'openai', model: 'gpt-4o-mini', base_url: null, api_key: null },
  embedding: { provider: 'openai', model: 'text-embedding-3-small', base_url: null, api_key: null },
  search: { db_path: '.local/search.db', rerank: false, cascade_threshold: 0.3 },
  git: { auto_commit: true, squash_on_lint: true, worktree_for_lint: true },
  consolidation: { batch_threshold: 10, archive_after_days: 30, archive_retention_months: 6 },
  sanitization: { enabled: true, mode: 'redact', custom_patterns: [], allowlist: [] },
};

export class ConfigLoader {
  constructor(private readonly wikiRoot: string) {}

  async load(): Promise<WikiConfig> {
    const shared = await this.loadYaml('.config/settings.shared.yaml');
    const local = await this.loadYaml('.local/settings.local.yaml');
    const envOverrides = this.loadEnvOverrides();
    return this.deepMerge(DEFAULTS, shared, local, envOverrides) as WikiConfig;
  }

  private loadEnvOverrides(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const envMap: Record<string, [string, string]> = {
      LLM_WIKI_LLM_API_KEY: ['llm', 'api_key'],
      LLM_WIKI_LLM_MODEL: ['llm', 'model'],
      LLM_WIKI_LLM_BASE_URL: ['llm', 'base_url'],
      LLM_WIKI_EMBEDDING_API_KEY: ['embedding', 'api_key'],
      LLM_WIKI_EMBEDDING_MODEL: ['embedding', 'model'],
      LLM_WIKI_EMBEDDING_BASE_URL: ['embedding', 'base_url'],
      LLM_WIKI_PATH: ['wiki', 'path'],
    };

    for (const [envKey, [section, field]] of Object.entries(envMap)) {
      const value = process.env[envKey];
      if (value !== undefined) {
        if (!result[section]) result[section] = {};
        (result[section] as Record<string, unknown>)[field] = value;
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
        if (value !== null && typeof value === 'object' && !Array.isArray(value) &&
            result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = this.deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  }
}
