export type IdempotencyOperation =
  | 'remember_fact'
  | 'remember_session'
  | 'import'
  | 'ingest'
  | 'lint';

export interface IdempotencyRecord {
  operation: IdempotencyOperation;
  key: string;
  fingerprint: string;
  status: 'in_progress' | 'completed';
  response?: unknown;
  startedAt: string;
  completedAt?: string;
}

export type IdempotencyAcquireResult =
  | { kind: 'acquired' }
  | { kind: 'replay'; record: IdempotencyRecord }
  | { kind: 'in_progress' }
  | { kind: 'conflict' };

export interface IIdempotencyStore {
  get(operation: IdempotencyOperation, key: string): Promise<IdempotencyRecord | null>;
  acquire(
    operation: IdempotencyOperation,
    key: string,
    fingerprint: string,
  ): Promise<IdempotencyAcquireResult>;
  complete(
    operation: IdempotencyOperation,
    key: string,
    fingerprint: string,
    response: unknown,
  ): Promise<void>;
  abort(operation: IdempotencyOperation, key: string, fingerprint: string): Promise<void>;
}
