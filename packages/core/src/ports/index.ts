export type { IFileStore, FileInfo, FileStoreFactory } from './file-store.js';
export type { IVerbatimStore } from './verbatim-store.js';
export type { IProjectResolver } from './project-resolver.js';
export type {
  IVersionControl,
  WorktreeInfo,
  ManagedWorktreeInfo,
  ManagedWorktreeStatus,
} from './version-control.js';
export type { ISearchEngine, SearchQuery, IndexEntry, IndexHealth } from './search-engine.js';
export type { ILlmClient, LlmCompletionRequest, LlmCompletionResponse } from './llm-client.js';
export type { IEmbeddingClient } from './embedding-client.js';
export type { ISourceReader, SourceContent } from './source-reader.js';
export { estimateTokens } from './source-reader.js';
export type { IStateStore } from './state-store.js';
export type { IArchiver, ArchiveEntry, ArchiveResult } from './archiver.js';
export type { IAgentMemoryReader, AgentMemoryDiscoveryOptions } from './agent-memory-reader.js';
