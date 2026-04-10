export interface CreateVerbatimEntryOptions {
  content: string;
  agent: string;
  sessionId: string;
  project?: string;
  tags?: string[];
  idGenerator?: () => string;
}

export interface VerbatimEntryData {
  session: string;
  agent: string;
  project?: string;
  tags?: string[];
  consolidated: boolean;
  created: string;
  content: string;
}

export class VerbatimEntry {
  private constructor(
    public readonly filename: string,
    public readonly agent: string,
    public readonly sessionId: string,
    public readonly project: string | undefined,
    public readonly tags: string[],
    public readonly consolidated: boolean,
    public readonly created: string,
    public readonly content: string,
  ) {}

  static create(opts: CreateVerbatimEntryOptions): VerbatimEntry {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const genId = opts.idGenerator ?? (() => Math.random().toString(16).slice(2, 10));
    const uuid = genId();
    const filename = `${date}-${opts.sessionId}-${uuid}.md`;

    return new VerbatimEntry(
      filename,
      opts.agent,
      opts.sessionId,
      opts.project,
      opts.tags ?? [],
      false,
      now.toISOString(),
      opts.content,
    );
  }

  static fromParsedData(filename: string, data: VerbatimEntryData): VerbatimEntry {
    return new VerbatimEntry(
      filename,
      data.agent,
      data.session,
      data.project,
      data.tags ?? [],
      data.consolidated ?? false,
      data.created ?? new Date().toISOString(),
      data.content.trim(),
    );
  }

  get filePath(): string {
    return `log/${this.agent}/raw/${this.filename}`;
  }

  toData(): VerbatimEntryData {
    return {
      session: this.sessionId,
      agent: this.agent,
      project: this.project,
      tags: this.tags.length > 0 ? this.tags : undefined,
      consolidated: this.consolidated,
      created: this.created,
      content: this.content,
    };
  }
}
