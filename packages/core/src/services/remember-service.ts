import { VerbatimEntry } from '../domain/verbatim-entry.js';
import { ContentEmptyError, SanitizationBlockedError } from '../domain/errors.js';
import type { IFileStore } from '../ports/file-store.js';
import type { IOperationJournal } from '../ports/operation-journal.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { SanitizationService } from './sanitization-service.js';
import { appendOperation, createOperationContext, journalErrorMetadata } from './operation-journal.js';

export interface RememberFactRequest {
  content: string;
  agent: string;
  sessionId: string;
  project?: string;
  tags?: string[];
  sourceUri?: string;
  sourceDigest?: string;
  operationId?: string;
  modelProvider?: string;
  modelName?: string;
  callId?: string;
  toolCallId?: string;
}

export interface RememberFactResponse {
  ok: true;
  file: string;
  entry_id: string;
}

export interface RememberSessionRequest {
  summary: string;
  agent: string;
  sessionId: string;
  project?: string;
  sourceUri?: string;
  sourceDigest?: string;
  operationId?: string;
  modelProvider?: string;
  modelName?: string;
  callId?: string;
  toolCallId?: string;
}

export interface RememberSessionResponse {
  ok: true;
  file: string;
  entry_id: string;
  created_at: string;
  facts_count: number;
}

export class RememberService {
  constructor(
    private readonly fileStore: IFileStore,
    private readonly verbatimStore: IVerbatimStore,
    private readonly sanitizer: SanitizationService,
    private readonly operationJournal?: IOperationJournal,
  ) {}

  async rememberFact(req: RememberFactRequest): Promise<RememberFactResponse> {
    const op = createOperationContext('remember_fact', {
      request: { source: 'mcp', actor: req.agent, requestId: req.callId ?? req.operationId },
    });
    await appendOperation(this.operationJournal, op, 'running');
    try {
      if (!req.content.trim()) throw new ContentEmptyError();

      const sanitized = this.sanitizer.sanitize(req.content);
      if (sanitized.isBlocked) throw new SanitizationBlockedError(sanitized.redactedRatio);

      const model = this.buildModelMetadata(req);
      const entry = VerbatimEntry.create({
        content: sanitized.content,
        agent: req.agent,
        sessionId: req.sessionId,
        project: req.project,
        tags: req.tags,
        source: { type: 'mcp_fact', uri: req.sourceUri, digest: req.sourceDigest },
        operationId: req.operationId,
        model,
      });

      await this.verbatimStore.writeEntry(entry);
      await appendOperation(this.operationJournal, op, 'succeeded', { touchedPaths: [entry.filePath] });

      return { ok: true, file: entry.filePath, entry_id: entry.entryId };
    } catch (error) {
      await appendOperation(this.operationJournal, op, 'failed', { error: journalErrorMetadata(error) });
      throw error;
    }
  }

  async rememberSession(req: RememberSessionRequest): Promise<RememberSessionResponse> {
    const op = createOperationContext('remember_session', {
      request: { source: 'mcp', actor: req.agent, requestId: req.callId ?? req.operationId },
    });
    await appendOperation(this.operationJournal, op, 'running');
    try {
      if (!req.summary.trim()) throw new ContentEmptyError();

    // Deduplication by session_id — return stored entry metadata, not new request data
    if (req.sessionId) {
      const existing = await this.findExistingSession(req.agent, req.sessionId);
      if (existing) {
        const storedContent = await this.fileStore.readFile(existing);
        const storedEntry = await this.verbatimStore.readEntry(existing);
        const factsCount = storedContent ? this.countFacts(storedContent) : 1;
        const dedupResponse: RememberSessionResponse = {
          ok: true,
          file: existing,
          entry_id: storedEntry?.entryId ?? existing.split('/').pop() ?? existing,
          created_at: storedEntry?.processing.created_at ?? new Date().toISOString(),
          facts_count: factsCount,
        };
        await appendOperation(this.operationJournal, op, 'succeeded', { touchedPaths: [existing] });
        return dedupResponse;
      }
    }

    const sanitized = this.sanitizer.sanitize(req.summary);
    if (sanitized.isBlocked) throw new SanitizationBlockedError(sanitized.redactedRatio);

    const model = this.buildModelMetadata(req);
    const entry = VerbatimEntry.create({
      content: sanitized.content,
      agent: req.agent,
      sessionId: req.sessionId,
      project: req.project,
      source: { type: 'session', uri: req.sourceUri, digest: req.sourceDigest },
      operationId: req.operationId,
      model,
    });

      await this.verbatimStore.writeEntry(entry);
      await appendOperation(this.operationJournal, op, 'succeeded', { touchedPaths: [entry.filePath] });

      return {
        ok: true,
        file: entry.filePath,
        entry_id: entry.entryId,
        created_at: entry.processing.created_at,
        facts_count: this.countFacts(sanitized.content),
      };
    } catch (error) {
      await appendOperation(this.operationJournal, op, 'failed', { error: journalErrorMetadata(error) });
      throw error;
    }
  }

  private async findExistingSession(agent: string, sessionId: string): Promise<string | null> {
    const files = await this.fileStore.listFiles(`log/${agent}/raw`);
    for (const file of files) {
      if (!file.path.includes(sessionId)) continue;
      const content = await this.fileStore.readFile(file.path);
      if (!content) continue;
      const sessionMatch = content.match(/^session:\s*(.+)$/m);
      if (sessionMatch && sessionMatch[1].trim() === sessionId) return file.path;
    }
    return null;
  }

  private countFacts(content: string): number {
    return content.split('\n').filter((line) => line.trim().startsWith('- ')).length || 1;
  }

  private buildModelMetadata(
    req: Pick<RememberFactRequest, 'modelProvider' | 'modelName' | 'callId' | 'toolCallId'>,
  ): { provider?: string; model?: string; call_id?: string; tool_call_id?: string } | undefined {
    if (!req.modelProvider && !req.modelName && !req.callId && !req.toolCallId) return undefined;
    return {
      provider: req.modelProvider,
      model: req.modelName,
      call_id: req.callId,
      tool_call_id: req.toolCallId,
    };
  }
}
