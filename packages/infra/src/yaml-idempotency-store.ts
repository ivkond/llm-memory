import path from 'node:path';
import { access, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type {
  IFileStore,
  IdempotencyAcquireResult,
  IIdempotencyStore,
  IdempotencyOperation,
  IdempotencyRecord,
} from '@ivkond-llm-wiki/core';

const IDEMPOTENCY_PATH = '.local/idempotency.yaml';
const IDEMPOTENCY_LOCK_PATH = '.local/idempotency.lock';
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_RETRY_MS = 25;

interface IdempotencyState {
  records: IdempotencyRecord[];
}

export class YamlIdempotencyStore implements IIdempotencyStore {
  private writeChain: Promise<void> = Promise.resolve();
  private readonly idempotencyFilePath: string | null;
  private readonly lockFilePath: string | null;

  constructor(
    private readonly fileStore: IFileStore,
    wikiRoot?: string,
  ) {
    if (wikiRoot) {
      this.idempotencyFilePath = path.resolve(wikiRoot, IDEMPOTENCY_PATH);
      this.lockFilePath = path.resolve(wikiRoot, IDEMPOTENCY_LOCK_PATH);
    } else {
      this.idempotencyFilePath = null;
      this.lockFilePath = null;
    }
  }

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
      if (existing.fingerprint !== fingerprint) return { kind: 'conflict' };
      if (existing.status === 'completed') return { kind: 'replay', record: existing };
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
    if (this.idempotencyFilePath && this.lockFilePath) {
      return this.withProcessFileLock(run);
    }

    let result!: T;
    const next = this.writeChain.then(async () => {
      result = await run();
    });
    this.writeChain = next.catch(() => undefined);
    await next;
    return result;
  }

  private async withProcessFileLock<T>(run: () => Promise<T>): Promise<T> {
    const lockPath = this.lockFilePath!;
    await mkdir(path.dirname(lockPath), { recursive: true });

    const start = Date.now();
    while (true) {
      try {
        const handle = await open(lockPath, 'wx');
        try {
          const result = await run();
          return result;
        } finally {
          await handle.close();
          await unlink(lockPath).catch(() => undefined);
        }
      } catch (error) {
        const isExists =
          typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'EEXIST';
        if (!isExists) throw error;
        if (Date.now() - start >= LOCK_TIMEOUT_MS) {
          throw new Error(`Idempotency lock timeout after ${LOCK_TIMEOUT_MS}ms`);
        }
        await sleep(LOCK_RETRY_MS);
      }
    }
  }

  private async loadState(): Promise<IdempotencyState> {
    const raw = await this.readRaw();
    if (!raw || !raw.trim()) return { records: [] };

    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object') return { records: [] };

    const recordsRaw = (parsed as { records?: unknown }).records;
    if (!Array.isArray(recordsRaw)) return { records: [] };

    const records = recordsRaw
      .map((rawRecord) => this.parseRecord(rawRecord))
      .filter((record): record is IdempotencyRecord => record !== null);
    return { records };
  }

  private async readRaw(): Promise<string | null> {
    if (this.idempotencyFilePath) {
      try {
        await access(this.idempotencyFilePath);
      } catch {
        return null;
      }
      return await readFile(this.idempotencyFilePath, 'utf8');
    }
    return await this.fileStore.readFile(IDEMPOTENCY_PATH);
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
    if (this.idempotencyFilePath) {
      const filePath = this.idempotencyFilePath;
      await mkdir(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(tmp, body, 'utf8');
      await rename(tmp, filePath);
      return;
    }
    await this.fileStore.writeFile(IDEMPOTENCY_PATH, body);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
