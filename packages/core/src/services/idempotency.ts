import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
  InvalidIdempotencyKeyError,
} from '../domain/errors.js';
import type { IIdempotencyStore, IdempotencyOperation } from '../ports/idempotency-store.js';

const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const MAX_WAIT_MS = 10_000;
const POLL_MS = 25;

export interface IdempotencyRunResult<T> {
  result: T;
  replayed: boolean;
}

export async function runWithIdempotency<T>(
  store: IIdempotencyStore,
  operation: IdempotencyOperation,
  key: string | undefined,
  request: unknown,
  action: () => Promise<T>,
): Promise<IdempotencyRunResult<T>> {
  if (!key) {
    return { result: await action(), replayed: false };
  }
  if (!IDEMPOTENCY_KEY_RE.test(key)) {
    throw new InvalidIdempotencyKeyError(key);
  }

  const fingerprint = stableStringify(request);
  while (true) {
    const acquired = await store.acquire(operation, key, fingerprint);
    if (acquired.kind === 'replay') {
      return { result: acquired.record.response as T, replayed: true };
    }
    if (acquired.kind === 'conflict') {
      throw new IdempotencyConflictError(operation, key);
    }
    if (acquired.kind === 'in_progress') {
      const replayed = await waitForCompletion<T>(store, operation, key, fingerprint);
      if (replayed) return { result: replayed, replayed: true };
      continue;
    }

    try {
      const result = await action();
      await store.complete(operation, key, fingerprint, result);
      return { result, replayed: false };
    } catch (error) {
      await store.abort(operation, key, fingerprint);
      throw error;
    }
  }
}

function stableStringify(input: unknown): string {
  return JSON.stringify(sortDeep(input));
}

function sortDeep(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sortDeep);
  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sortDeep(v)]));
  }
  return input;
}

async function waitForCompletion<T>(
  store: IIdempotencyStore,
  operation: IdempotencyOperation,
  key: string,
  fingerprint: string,
): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const existing = await store.get(operation, key);
    if (!existing) return null;
    if (existing.fingerprint !== fingerprint) {
      throw new IdempotencyConflictError(operation, key);
    }
    if (existing.status === 'completed') {
      return existing.response as T;
    }
    await sleep(POLL_MS);
  }
  throw new IdempotencyInProgressError(operation, key);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
