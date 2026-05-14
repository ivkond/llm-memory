import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  WriteLockAcquisitionError,
  WriteLockTimeoutError,
  type IWriteCoordinator,
  type WriteOperation,
} from '@ivkond-llm-wiki/core';

interface FsWriteCoordinatorOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
  staleMs?: number;
  heartbeatMs?: number;
}

interface LockMetadata {
  ownerId: string;
  pid: number;
  operation: string;
  startedAt: string;
  heartbeatAt: string;
}

export class FsWriteCoordinator implements IWriteCoordinator {
  private readonly lockPath: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly staleMs: number;
  private readonly heartbeatMs: number;

  constructor(
    private readonly wikiRoot: string,
    options: FsWriteCoordinatorOptions = {},
  ) {
    this.lockPath = path.join(this.wikiRoot, '.llm-memory', 'write.lock');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryDelayMs = options.retryDelayMs ?? 100;
    this.staleMs = options.staleMs ?? 5 * 60_000;
    this.heartbeatMs = options.heartbeatMs ?? Math.max(250, Math.floor(this.staleMs / 3));
  }

  async runExclusive<T>(operation: WriteOperation, work: () => Promise<T>): Promise<T> {
    const lock = await this.acquire(operation);
    const stopHeartbeat = this.startHeartbeat(lock);
    try {
      return await work();
    } finally {
      stopHeartbeat();
      await this.release(lock.ownerId);
    }
  }

  private async acquire(operation: WriteOperation): Promise<LockMetadata> {
    await mkdir(path.dirname(this.lockPath), { recursive: true });
    const started = Date.now();
    while (Date.now() - started < this.timeoutMs) {
      try {
        await mkdir(this.lockPath, { recursive: false });
        const lock: LockMetadata = {
          ownerId: randomUUID(),
          pid: process.pid,
          operation: operation.name,
          startedAt: new Date().toISOString(),
          heartbeatAt: new Date().toISOString(),
        };
        try {
          await this.writeMetadata(lock);
        } catch (err) {
          await rm(this.lockPath, { recursive: true, force: true });
          throw err;
        }
        return lock;
      } catch (err) {
        const code = this.errno(err);
        if (code !== 'EEXIST') {
          throw new WriteLockAcquisitionError(
            operation.name,
            err instanceof Error ? err.message : String(err),
          );
        }
        const recovered = await this.recoverIfStale();
        if (!recovered) {
          await sleep(this.retryDelayMs + Math.floor(Math.random() * 25));
        }
      }
    }
    throw new WriteLockTimeoutError(operation.name, this.timeoutMs);
  }

  private async writeMetadata(metadata: LockMetadata): Promise<void> {
    await writeFile(
      path.join(this.lockPath, 'metadata.json'),
      `${JSON.stringify(metadata)}\n`,
      'utf8',
    );
  }

  private startHeartbeat(lock: LockMetadata): () => void {
    const timer = setInterval(() => {
      void this.touchHeartbeat(lock);
    }, this.heartbeatMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  private async touchHeartbeat(lock: LockMetadata): Promise<void> {
    const current = await this.readMetadata();
    if (!current || current.ownerId !== lock.ownerId) return;
    await this.writeMetadata({ ...current, heartbeatAt: new Date().toISOString() });
  }

  private async recoverIfStale(): Promise<boolean> {
    try {
      const metadata = await this.readMetadata();
      if (metadata) {
        const heartbeatAt = Date.parse(metadata.heartbeatAt);
        if (Number.isFinite(heartbeatAt) && Date.now() - heartbeatAt <= this.staleMs) {
          return false;
        }
      } else {
        const lockStats = await stat(this.lockPath);
        if (Date.now() - lockStats.mtimeMs <= this.staleMs) {
          return false;
        }
      }
      const current = await this.readMetadata();
      if (current && metadata && current.ownerId !== metadata.ownerId) {
        return false;
      }
      await rm(this.lockPath, { recursive: true, force: true });
      return true;
    } catch (err) {
      const code = this.errno(err);
      if (code === 'ENOENT') return true;
      return false;
    }
  }

  private async release(ownerId: string): Promise<void> {
    const metadata = await this.readMetadata();
    if (!metadata) return;
    if (metadata.ownerId !== ownerId) return;
    await rm(this.lockPath, { recursive: true, force: true });
  }

  private async readMetadata(): Promise<LockMetadata | null> {
    try {
      const raw = await readFile(path.join(this.lockPath, 'metadata.json'), 'utf8');
      const parsed = JSON.parse(raw) as Partial<LockMetadata>;
      if (
        typeof parsed.ownerId !== 'string' ||
        typeof parsed.pid !== 'number' ||
        typeof parsed.operation !== 'string' ||
        typeof parsed.startedAt !== 'string' ||
        typeof parsed.heartbeatAt !== 'string'
      ) {
        return null;
      }
      return parsed as LockMetadata;
    } catch (err) {
      const code = this.errno(err);
      if (code === 'ENOENT') return null;
      return null;
    }
  }

  private errno(err: unknown): string | undefined {
    if (!err || typeof err !== 'object') return undefined;
    const value = (err as { code?: unknown }).code;
    return typeof value === 'string' ? value : undefined;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
