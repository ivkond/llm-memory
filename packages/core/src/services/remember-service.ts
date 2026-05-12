import { VerbatimEntry } from '../domain/verbatim-entry.js';
import { ContentEmptyError, SanitizationBlockedError } from '../domain/errors.js';
import type { IFileStore } from '../ports/file-store.js';
import type { IIdempotencyStore } from '../ports/idempotency-store.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { SanitizationService } from './sanitization-service.js';
import { runWithIdempotency } from './idempotency.js';

export interface RememberFactRequest {
  content: string;
  agent: string;
  sessionId: string;
  project?: string;
  tags?: string[];
  idempotencyKey?: string;
}

export interface RememberFactResponse {
  ok: true;
  file: string;
  entry_id: string;
  idempotency_replayed?: boolean;
}

export interface RememberSessionRequest {
  summary: string;
  agent: string;
  sessionId: string;
  project?: string;
  idempotencyKey?: string;
}

export interface RememberSessionResponse {
  ok: true;
  file: string;
  facts_count: number;
  idempotency_replayed?: boolean;
}

export class RememberService {
  constructor(
    private readonly fileStore: IFileStore,
    private readonly verbatimStore: IVerbatimStore,
    private readonly sanitizer: SanitizationService,
    private readonly idempotencyStore: IIdempotencyStore,
  ) {}

  async rememberFact(req: RememberFactRequest): Promise<RememberFactResponse> {
    if (!req.content.trim()) throw new ContentEmptyError();

    const sanitized = this.sanitizer.sanitize(req.content);
    if (sanitized.isBlocked) throw new SanitizationBlockedError(sanitized.redactedRatio);

    const { result, replayed } = await runWithIdempotency(
      this.idempotencyStore,
      'remember_fact',
      req.idempotencyKey,
      {
        content: sanitized.content,
        agent: req.agent,
        sessionId: req.sessionId,
        project: req.project,
        tags: req.tags ?? [],
      },
      async () => {
        const entry = VerbatimEntry.create({
          content: sanitized.content,
          agent: req.agent,
          sessionId: req.sessionId,
          project: req.project,
          tags: req.tags,
        });
        await this.verbatimStore.writeEntry(entry);
        return { ok: true as const, file: entry.filePath, entry_id: entry.filename };
      },
    );
    return replayed ? { ...result, idempotency_replayed: true } : result;
  }

  async rememberSession(req: RememberSessionRequest): Promise<RememberSessionResponse> {
    if (!req.summary.trim()) throw new ContentEmptyError();

    // Deduplication by session_id — return stored entry metadata, not new request data
    if (req.sessionId) {
      const existing = await this.findExistingSession(req.agent, req.sessionId);
      if (existing) {
        const storedContent = await this.fileStore.readFile(existing);
        const factsCount = storedContent ? this.countFacts(storedContent) : 1;
        return { ok: true, file: existing, facts_count: factsCount };
      }
    }

    const sanitized = this.sanitizer.sanitize(req.summary);
    if (sanitized.isBlocked) throw new SanitizationBlockedError(sanitized.redactedRatio);

    const { result, replayed } = await runWithIdempotency(
      this.idempotencyStore,
      'remember_session',
      req.idempotencyKey,
      {
        summary: sanitized.content,
        agent: req.agent,
        sessionId: req.sessionId,
        project: req.project,
      },
      async () => {
        const entry = VerbatimEntry.create({
          content: sanitized.content,
          agent: req.agent,
          sessionId: req.sessionId,
          project: req.project,
        });
        await this.verbatimStore.writeEntry(entry);
        return {
          ok: true as const,
          file: entry.filePath,
          facts_count: this.countFacts(sanitized.content),
        };
      },
    );
    return replayed ? { ...result, idempotency_replayed: true } : result;
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
}
