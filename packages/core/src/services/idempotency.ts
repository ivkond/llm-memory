import {
  IdempotencyConflictError,
  InvalidIdempotencyKeyError,
} from '../domain/errors.js';
import type { IIdempotencyStore, IdempotencyOperation } from '../ports/idempotency-store.js';

const IDEMPOTENCY_KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

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

  const fingerprint = stableHash(stableStringify(request));
  const existing = await store.get(operation, key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new IdempotencyConflictError(operation, key);
    }
    return { result: existing.response as T, replayed: true };
  }

  const result = await action();
  await store.put({
    operation,
    key,
    fingerprint,
    response: result,
    completedAt: new Date().toISOString(),
  });
  return { result, replayed: false };
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

function stableHash(input: string): string {
  let hash = 0;
  for (const ch of input) {
    hash = Math.trunc((hash << 5) - hash + (ch.codePointAt(0) ?? 0));
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
