import yaml from 'js-yaml';
import type {
  IFileStore,
  IIdempotencyStore,
  IdempotencyOperation,
  IdempotencyRecord,
} from '@ivkond-llm-wiki/core';

const IDEMPOTENCY_PATH = '.local/idempotency.yaml';

interface IdempotencyState {
  records: IdempotencyRecord[];
}

export class YamlIdempotencyStore implements IIdempotencyStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly fileStore: IFileStore) {}

  async get(operation: IdempotencyOperation, key: string): Promise<IdempotencyRecord | null> {
    const state = await this.loadState();
    return state.records.find((r) => r.operation === operation && r.key === key) ?? null;
  }

  async put(record: IdempotencyRecord): Promise<void> {
    const next = this.writeChain.then(async () => {
      const state = await this.loadState();
      const records = state.records.filter(
        (r) => !(r.operation === record.operation && r.key === record.key),
      );
      records.push(record);
      await this.writeState({ records });
    });
    this.writeChain = next.catch(() => undefined);
    await next;
  }

  private async loadState(): Promise<IdempotencyState> {
    const raw = await this.fileStore.readFile(IDEMPOTENCY_PATH);
    if (!raw || !raw.trim()) {
      return { records: [] };
    }
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { records: [] };
    }
    const recordsRaw = (parsed as { records?: unknown }).records;
    if (!Array.isArray(recordsRaw)) {
      return { records: [] };
    }
    const records = recordsRaw
      .map((rawRecord) => this.parseRecord(rawRecord))
      .filter((record): record is IdempotencyRecord => record !== null);
    return { records };
  }

  private parseRecord(rawRecord: unknown): IdempotencyRecord | null {
    if (!rawRecord || typeof rawRecord !== 'object') return null;
    const record = rawRecord as Record<string, unknown>;
    if (
      typeof record.operation !== 'string' ||
      typeof record.key !== 'string' ||
      typeof record.fingerprint !== 'string' ||
      typeof record.completedAt !== 'string'
    ) {
      return null;
    }
    return {
      operation: record.operation as IdempotencyOperation,
      key: record.key,
      fingerprint: record.fingerprint,
      response: record.response,
      completedAt: record.completedAt,
    };
  }

  private async writeState(state: IdempotencyState): Promise<void> {
    const body = yaml.dump(state, { noRefs: true, sortKeys: true });
    await this.fileStore.writeFile(IDEMPOTENCY_PATH, body);
  }
}
