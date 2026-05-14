export const OPERATION_TYPES = [
  'remember_fact',
  'remember_session',
  'import',
  'ingest',
  'lint',
  'consolidate',
  'promote',
  'reindex',
  'archive',
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

export const OPERATION_STATUSES = [
  'running',
  'succeeded',
  'failed',
  'interrupted',
  'blocked_or_conflict',
] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export interface OperationRequestMetadata {
  requestId?: string;
  source?: string;
  actor?: string;
  idempotencyKey?: string;
}

export interface OperationWorktreeMetadata {
  path: string;
  branch?: string;
  baseRef?: string;
}

export interface OperationErrorMetadata {
  name: string;
  message: string;
  code?: string;
  category?: string;
}

export interface OperationMetadata {
  request?: OperationRequestMetadata;
  touchedPaths: string[];
  worktree?: OperationWorktreeMetadata;
  commitSha?: string;
  error?: OperationErrorMetadata;
  disabledReason?: string;
  resumeReason?: string;
}

export interface OperationJournalRecord {
  id: string;
  type: OperationType;
  status: OperationStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  metadata: OperationMetadata;
}

export interface OperationJournalSnapshot {
  storagePath: '.local/operations';
  disabledReason: string | null;
  degradedReasons: string[];
  records: OperationJournalRecord[];
}

const TERMINAL_OPERATION_STATUSES = new Set<OperationStatus>([
  'succeeded',
  'failed',
  'interrupted',
  'blocked_or_conflict',
]);
const REDACTED_ERROR_MESSAGE = '[REDACTED_ERROR_MESSAGE]';
const REDACTED_REASON = '[REDACTED_REASON]';

function hasFreeformText(value: string | undefined): boolean {
  if (value === undefined) return false;
  const trimmed = value.trim();
  return trimmed !== '';
}

export function transitionOperationStatus(
  current: OperationStatus,
  next: OperationStatus,
): OperationStatus {
  if (current === 'running') return next;
  if (current === next) return current;
  throw new Error(`Invalid operation status transition: ${current} -> ${next}`);
}

export function sanitizeOperationMetadata(metadata: Partial<OperationMetadata>): OperationMetadata {
  const request = metadata.request
    ? {
        requestId: metadata.request.requestId,
        source: metadata.request.source,
        actor: metadata.request.actor,
        idempotencyKey: metadata.request.idempotencyKey,
      }
    : undefined;

  return {
    request,
    touchedPaths: [...new Set((metadata.touchedPaths ?? []).filter((value) => value.trim() !== ''))],
    worktree: metadata.worktree,
    commitSha: metadata.commitSha,
    error: metadata.error
      ? {
          name: metadata.error.name,
          message: REDACTED_ERROR_MESSAGE,
          code: metadata.error.code,
          category: metadata.error.category,
        }
      : undefined,
    disabledReason: hasFreeformText(metadata.disabledReason) ? REDACTED_REASON : undefined,
    resumeReason: hasFreeformText(metadata.resumeReason) ? REDACTED_REASON : undefined,
  };
}

export function isTerminalOperationStatus(status: OperationStatus): boolean {
  return TERMINAL_OPERATION_STATUSES.has(status);
}
