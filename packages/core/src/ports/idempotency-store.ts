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
  response: unknown;
  completedAt: string;
}

export interface IIdempotencyStore {
  get(operation: IdempotencyOperation, key: string): Promise<IdempotencyRecord | null>;
  put(record: IdempotencyRecord): Promise<void>;
}
