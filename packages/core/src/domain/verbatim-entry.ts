import { InvalidIdentifierError } from './errors.js';

export interface CreateVerbatimEntryOptions {
  content: string;
  agent: string;
  sessionId: string;
  project?: string;
  tags?: string[];
  idGenerator?: () => string;
  /**
   * Override the entry's creation timestamp. ImportService uses this to
   * derive deterministic filenames from the source file's mtime instead
   * of the current wall clock — required for rerun idempotency.
   */
  createdAt?: Date;
  entryId?: string;
  source?: VerbatimSourceMetadata;
  model?: VerbatimModelMetadata;
  operationId?: string;
  processing?: Partial<VerbatimProcessingMetadata>;
}

export interface VerbatimSourceMetadata {
  type: string;
  uri?: string;
  digest?: string;
}

export interface VerbatimModelMetadata {
  provider?: string;
  model?: string;
  call_id?: string;
  tool_call_id?: string;
}

export interface VerbatimProcessingMetadata {
  created_at: string;
  ingested_at?: string;
  imported_at?: string;
  consolidated_at?: string;
  updated_at?: string;
}

export interface VerbatimEntryData {
  entry_id?: string;
  session: string;
  agent: string;
  project?: string;
  tags?: string[];
  source?: VerbatimSourceMetadata;
  model?: VerbatimModelMetadata;
  operation_id?: string;
  processing?: VerbatimProcessingMetadata;
  consolidated: boolean;
  created: string;
  content: string;
}

/**
 * Identifiers that get interpolated into filesystem paths (agent, sessionId)
 * must be restricted to safe slug characters — otherwise a value like
 * '../other-agent' would let a writer escape log/<agent>/raw/.
 */
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const ENTRY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function assertIdentifier(field: string, value: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new InvalidIdentifierError(field, value);
  }
}

function assertEntryId(value: string): void {
  if (!ENTRY_ID_PATTERN.test(value)) {
    throw new InvalidIdentifierError('entry_id', value);
  }
}

export class VerbatimEntry {
  private constructor(
    public readonly filename: string,
    public readonly entryId: string,
    public readonly agent: string,
    public readonly sessionId: string,
    public readonly project: string | undefined,
    public readonly tags: string[],
    public readonly source: VerbatimSourceMetadata,
    public readonly model: VerbatimModelMetadata | undefined,
    public readonly operationId: string | undefined,
    public readonly processing: VerbatimProcessingMetadata,
    public readonly consolidated: boolean,
    public readonly created: string,
    public readonly content: string,
  ) {}

  static create(opts: CreateVerbatimEntryOptions): VerbatimEntry {
    assertIdentifier('agent', opts.agent);
    assertIdentifier('sessionId', opts.sessionId);

    const now = opts.createdAt ?? new Date();
    const date = now.toISOString().slice(0, 10);
    const genId = opts.idGenerator ?? (() => Math.random().toString(16).slice(2, 10));
    const entryId = opts.entryId ?? genId();
    assertEntryId(entryId);
    const filename = `${date}-${opts.sessionId}-${entryId}.md`;
    const processing: VerbatimProcessingMetadata = {
      created_at: now.toISOString(),
      ...opts.processing,
    };
    const source: VerbatimSourceMetadata = opts.source ?? { type: 'manual' };

    return new VerbatimEntry(
      filename,
      entryId,
      opts.agent,
      opts.sessionId,
      opts.project,
      opts.tags ?? [],
      source,
      opts.model,
      opts.operationId,
      processing,
      false,
      now.toISOString(),
      opts.content,
    );
  }

  static fromParsedData(filename: string, data: VerbatimEntryData): VerbatimEntry {
    assertIdentifier('agent', data.agent);
    assertIdentifier('sessionId', data.session);
    const fallbackEntryId = filename.replace(/\.md$/, '');
    const entryId = data.entry_id ?? fallbackEntryId;
    assertEntryId(entryId);
    const created = data.created || data.processing?.created_at || new Date().toISOString();
    const processing: VerbatimProcessingMetadata = {
      created_at: created,
      ...(data.processing ?? {}),
    };
    const source = data.source ?? { type: 'legacy' };

    return new VerbatimEntry(
      filename,
      entryId,
      data.agent,
      data.session,
      data.project,
      data.tags ?? [],
      source,
      data.model,
      data.operation_id,
      processing,
      data.consolidated ?? false,
      created,
      data.content.trim(),
    );
  }

  get filePath(): string {
    return `log/${this.agent}/raw/${this.filename}`;
  }

  toData(): VerbatimEntryData {
    return {
      entry_id: this.entryId,
      session: this.sessionId,
      agent: this.agent,
      project: this.project,
      tags: this.tags.length > 0 ? this.tags : undefined,
      source: this.source,
      model: this.model,
      operation_id: this.operationId,
      processing: this.processing,
      consolidated: this.consolidated,
      created: this.processing.created_at,
      content: this.content,
    };
  }
}
