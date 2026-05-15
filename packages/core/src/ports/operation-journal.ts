import type { OperationJournalRecord, OperationJournalSnapshot } from '../domain/operation-journal.js';

export interface IOperationJournal {
  /** Load operation records and diagnostics from local journal storage. */
  load(): Promise<OperationJournalSnapshot>;

  /** Append one operation record to the durable journal. */
  append(record: OperationJournalRecord): Promise<void>;
}
