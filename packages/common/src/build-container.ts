import path from 'node:path';
import { homedir } from 'node:os';
import { createOpenAI } from '@ai-sdk/openai';
import {
  FsFileStore,
  FsVerbatimStore,
  GitProjectResolver,
  GitVersionControl,
  RuVectorSearchEngine,
  AiSdkLlmClient,
  AiSdkEmbeddingClient,
  YamlStateStore,
  FsSourceReader,
  HttpSourceReader,
  CompositeSourceReader,
  SevenZipArchiver,
  ClaudeCodeMemoryReader,
  FsOperationJournal,
  type WikiConfig,
} from '@ivkond-llm-wiki/infra';
import {
  RememberService,
  RecallService,
  QueryService,
  IngestService,
  WikiStatusService,
  LintService,
  ImportService,
  SanitizationService,
  ConsolidatePhase,
  PromotePhase,
  HealthPhase,
  type IFileStore,
} from '@ivkond-llm-wiki/core';
import type { AppServices } from './app-services.js';

/**
 * Default dimensionality for OpenAI `text-embedding-3-small`. Future phases
 * may surface this via `WikiConfig.embedding.dims` when we support multiple
 * embedding providers.
 */
const DEFAULT_EMBEDDING_DIMS = 1536;

/**
 * Composition root — assembles all infra adapters and wires them into the
 * domain services via pure constructor injection. Returns a frozen
 * `AppServices` container consumed by transport layers (MCP server, CLI).
 *
 * Invariants:
 *   - One `FsFileStore` rooted at the wiki directory for main-branch reads.
 *   - Shared `fileStoreFactory` closure used by both `IngestService` and
 *     `LintService` for worktree-scoped file stores.
 *   - LLM and embedding clients are lazy — no network I/O happens in this
 *     function, so a missing `api_key` does not throw here.
 *   - The returned object is `Object.freeze`d to prevent downstream tampering.
 */
export function buildContainer(config: WikiConfig): AppServices {
  const wikiRoot = expandHome(config.wiki.path);

  const fileStoreFactory = (root: string): IFileStore => new FsFileStore(root);
  const verbatimStoreFactory = (fs: IFileStore) => new FsVerbatimStore(fs);

  const fileStore = fileStoreFactory(wikiRoot);
  const verbatimStore = verbatimStoreFactory(fileStore);
  const projectResolver = new GitProjectResolver(fileStore);
  const versionControl = new GitVersionControl(wikiRoot);
  const stateStore = new YamlStateStore(fileStore);
  const sourceReader = new CompositeSourceReader(new FsSourceReader(), new HttpSourceReader());
  const archiver = new SevenZipArchiver();
  const operationJournal = new FsOperationJournal(wikiRoot);

  const llmProvider = createOpenAI({
    apiKey: config.llm.api_key ?? undefined,
    baseURL: config.llm.base_url ?? undefined,
  });
  const llmClient = new AiSdkLlmClient(llmProvider.languageModel(config.llm.model));

  const embProvider = createOpenAI({
    apiKey: config.embedding.api_key ?? undefined,
    baseURL: config.embedding.base_url ?? undefined,
  });
  const embeddingClient = new AiSdkEmbeddingClient(
    embProvider.textEmbeddingModel(config.embedding.model),
    DEFAULT_EMBEDDING_DIMS,
  );

  const searchDbPath = path.resolve(wikiRoot, config.search.db_path);
  const searchEngine = new RuVectorSearchEngine(searchDbPath, embeddingClient);

  const sanitizer = new SanitizationService({
    enabled: config.sanitization.enabled,
    mode: config.sanitization.mode,
    customPatterns: config.sanitization.custom_patterns,
    allowlist: config.sanitization.allowlist,
  });

  const remember = new RememberService(fileStore, verbatimStore, sanitizer);
  const recall = new RecallService(fileStore, verbatimStore, projectResolver);
  const query = new QueryService(searchEngine, llmClient, projectResolver, fileStore);
  const status = new WikiStatusService(fileStore, verbatimStore, searchEngine, stateStore);
  const ingest = new IngestService(
    sourceReader,
    llmClient,
    searchEngine,
    versionControl,
    fileStore,
    fileStoreFactory,
    stateStore,
  );
  const lint = new LintService({
    mainRepoRoot: wikiRoot,
    mainFileStore: fileStore,
    mainVerbatimStore: verbatimStore,
    versionControl,
    searchEngine,
    fileStoreFactory,
    verbatimStoreFactory,
    stateStore,
    archiver,
    makeConsolidatePhase: (fs, vs) => {
      const phase = new ConsolidatePhase(fs, vs, llmClient, wikiRoot);
      return { name: 'consolidate', run: () => phase.run() };
    },
    makePromotePhase: (fs) => {
      const phase = new PromotePhase(fs, llmClient);
      return { name: 'promote', run: () => phase.run() };
    },
    makeHealthPhase: (fs) => {
      const phase = new HealthPhase(fs);
      return { name: 'health', run: () => phase.run() };
    },
  });
  const import_ = new ImportService({
    readers: new Map([['claude-code', new ClaudeCodeMemoryReader()]]),
    verbatimStore,
    stateStore,
    agentConfigs: {},
  });

  return Object.freeze({ remember, recall, query, ingest, status, lint, import_, operationJournal });
}

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(homedir(), p.slice(1)) : p;
}
