import { randomUUID } from 'node:crypto';
import type {
  IOperationJournal,
} from '../ports/index.js';
import type {
  OperationErrorMetadata,
  OperationJournalRecord,
  OperationMetadata,
  OperationStatus,
  OperationType,
} from '../domain/operation-journal.js';
import { WikiError } from '../domain/errors.js';

export interface OperationJournalContext {
  id: string;
  type: OperationType;
  startedAt: string;
  metadata: OperationMetadata;
}

export function createOperationContext(
  type: OperationType,
  metadata: Partial<OperationMetadata> = {},
): OperationJournalContext {
  return {
    id: randomUUID(),
    type,
    startedAt: new Date().toISOString(),
    metadata: {
      touchedPaths: [],
      ...metadata,
    },
  };
}

export async function appendOperation(
  journal: IOperationJournal | undefined,
  ctx: OperationJournalContext,
  status: OperationStatus,
  metadata: Partial<OperationMetadata> = {},
): Promise<void> {
  if (!journal) return;
  const now = new Date().toISOString();
  const record: OperationJournalRecord = {
    id: ctx.id,
    type: ctx.type,
    status,
    startedAt: ctx.startedAt,
    updatedAt: now,
    finishedAt: status === 'running' ? undefined : now,
    metadata: {
      ...ctx.metadata,
      ...metadata,
      touchedPaths: [...new Set([...(ctx.metadata.touchedPaths ?? []), ...(metadata.touchedPaths ?? [])])],
    },
  };
  await journal.append(record);
}

export function journalErrorMetadata(error: unknown): OperationErrorMetadata {
  if (error instanceof WikiError) {
    return { name: error.name, message: error.message, code: error.code, category: 'wiki' };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message, category: 'runtime' };
  }
  return { name: 'UnknownError', message: String(error), category: 'runtime' };
}
