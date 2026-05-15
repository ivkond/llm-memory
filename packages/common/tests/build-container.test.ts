import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentConfig } from '@ivkond-llm-wiki/core';
import {
  RememberService,
  RecallService,
  QueryService,
  IngestService,
  WikiStatusService,
  LintService,
  ImportService,
  type IOperationJournal,
} from '@ivkond-llm-wiki/core';
import type { WikiConfig } from '@ivkond-llm-wiki/infra';
import { buildContainer } from '../src/build-container.js';

function makeTestConfig(tmpDir: string): WikiConfig {
  return {
    wiki: { path: tmpDir },
    llm: { provider: 'openai', model: 'gpt-4o-mini', base_url: null, api_key: null },
    embedding: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      base_url: null,
      api_key: null,
    },
    search: { db_path: '.local/search.db', rerank: false, cascade_threshold: 0.3 },
    git: { auto_commit: true, squash_on_lint: true, worktree_for_lint: true },
    consolidation: { batch_threshold: 10, archive_after_days: 30, archive_retention_months: 6 },
    sanitization: { enabled: false, mode: 'redact', custom_patterns: [], allowlist: [] },
    mcp: { host: '127.0.0.1', port: 7849 },
  };
}

describe('buildContainer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-common-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('test_buildContainer_validConfig_returnsAllSevenServices', () => {
    const config = makeTestConfig(tempDir);

    const services = buildContainer(config);

    expect(services.remember).toBeInstanceOf(RememberService);
    expect(services.recall).toBeInstanceOf(RecallService);
    expect(services.query).toBeInstanceOf(QueryService);
    expect(services.ingest).toBeInstanceOf(IngestService);
    expect(services.status).toBeInstanceOf(WikiStatusService);
    expect(services.lint).toBeInstanceOf(LintService);
    expect(services.import_).toBeInstanceOf(ImportService);
  });

  it('test_buildContainer_returnsFrozenObject_cannotReassignFields', () => {
    const config = makeTestConfig(tempDir);

    const services = buildContainer(config);

    expect(Object.isFrozen(services)).toBe(true);
    expect(() => {
      (services as unknown as { remember: unknown }).remember = null;
    }).toThrow();
  });

  it('test_buildContainer_ingestService_exposesFileStoreFactory_returnsFsFileStoreLike', () => {
    const config = makeTestConfig(tempDir);

    const services = buildContainer(config);

    // Duck-type the IngestService's private fileStoreFactory via a safe cast.
    const factory = (services.ingest as unknown as { fileStoreFactory: unknown }).fileStoreFactory;
    expect(typeof factory).toBe('function');

    const fs = (factory as (root: string) => unknown)(tempDir);
    expect(fs).toBeTruthy();
    expect(typeof (fs as { readFile: unknown }).readFile).toBe('function');
    expect(typeof (fs as { listFiles: unknown }).listFiles).toBe('function');
    expect(typeof (fs as { writeFile: unknown }).writeFile).toBe('function');
  });

  it('test_buildContainer_missingLlmApiKey_stillConstructs_doesNotThrow', () => {
    const config = makeTestConfig(tempDir);
    config.llm.api_key = null;
    config.embedding.api_key = null;

    expect(() => buildContainer(config)).not.toThrow();
  });

  it('test_appServices_exportsOperationJournal', () => {
    const config = makeTestConfig(tempDir);

    const services = buildContainer(config);

    expect(typeof (services.operationJournal as IOperationJournal).append).toBe('function');
    expect(typeof (services.operationJournal as IOperationJournal).load).toBe('function');

    const keys = Object.keys(services).sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual(
      ['import_', 'ingest', 'lint', 'operationJournal', 'query', 'recall', 'remember', 'status']
        .sort((a, b) => a.localeCompare(b)),
    );
    expect(keys).toHaveLength(8);
  });

  it('test_buildContainer_importService_registersAntigravityWithScopedDefaults', () => {
    const config = makeTestConfig(tempDir);
    const services = buildContainer(config);
    const importService = services.import_ as unknown as {
      deps: {
        agentConfigs: Record<string, AgentConfig>;
      };
    };

    const configs = importService.deps.agentConfigs;
    expect(configs.antigravity?.enabled).toBe(true);
    expect(configs.antigravity?.paths).toEqual([
      path.join(process.cwd(), '.agents', 'rules', '**', '*.md').replaceAll('\\', '/'),
      path.join(process.cwd(), '.agent', 'rules', '**', '*.md').replaceAll('\\', '/'),
    ]);
  });
});
