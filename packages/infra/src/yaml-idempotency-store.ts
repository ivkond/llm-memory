import yaml from 'js-yaml';
import type {
  IFileStore,
  IdempotencyAcquireResult,
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

  async acquire(
    operation: IdempotencyOperation,
    key: string,
    fingerprint: string,
  ): Promise<IdempotencyAcquireResult> {
    return this.withWriteLock(async () => {
      const state = await this.loadState();
      const existing = state.records.find((r) => r.operation === operation && r.key === key) ?? null;
      if (!existing) {
        state.records.push({
          operation,
          key,
          fingerprint,
          status: 'in_progress',
          startedAt: new Date().toISOString(),
        });
        await this.writeState(state);
        return { kind: 'acquired' };
      }
      if (existing.fingerprint !== fingerprint) {
        return { kind: 'conflict' };
      }
      if (existing.status === 'completed') {
        return { kind: 'replay', record: existing };
      }
      return { kind: 'in_progress' };
    });
  }

  async complete(
    operation: IdempotencyOperation,
    key: string,
    fingerprint: string,
    response: unknown,
  ): Promise<void> {
    await this.withWriteLock(async () => {
      const state = await this.loadState();
      const idx = state.records.findIndex((r) => r.operation === operation && r.key === key);
      const now = new Date().toISOString();
      const record: IdempotencyRecord = {
        operation,
        key,
        fingerprint,
        status: 'completed',
        response,
        startedAt: idx >= 0 ? state.records[idx].startedAt : now,
        completedAt: now,
      };
      if (idx >= 0) {
        state.records[idx] = record;
      } else {
        state.records.push(record);
      }
      await this.writeState(state);
    });
  }

  async abort(operation: IdempotencyOperation, key: string, fingerprint: string): Promise<void> {
    await this.withWriteLock(async () => {
      const state = await this.loadState();
      state.records = state.records.filter(
        (r) =>
          !(
            r.operation === operation &&
            r.key === key &&
            r.fingerprint === fingerprint &&
            r.status === 'in_progress'
          ),
      );
      await this.writeState(state);
    });
  }

  private async withWriteLock<T>(run: () => Promise<T>): Promise<T> {
    let result!: T;
    const next = this.writeChain.then(async () => {
      result = await run();
    });
    this.writeChain = next.catch(() => undefined);
    await next;
    return result;
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
      (record.status !== 'in_progress' && record.status !== 'completed') ||
      typeof record.startedAt !== 'string'
    ) {
      return null;
    }
    return {
      operation: record.operation as IdempotencyOperation,
      key: record.key,
      fingerprint: record.fingerprint,
      status: record.status as 'in_progress' | 'completed',
      response: record.response,
      startedAt: record.startedAt,
      completedAt: typeof record.completedAt === 'string' ? record.completedAt : undefined,
    };
  }

  private async writeState(state: IdempotencyState): Promise<void> {
    const body = yaml.dump(state, { noRefs: true, sortKeys: true });
    await this.fileStore.writeFile(IDEMPOTENCY_PATH, body);
  }
}
