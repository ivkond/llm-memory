import { mkdir, readFile, appendFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  type IOperationJournal,
  type OperationJournalRecord,
  type OperationJournalSnapshot,
  sanitizeOperationMetadata,
} from '@ivkond-llm-wiki/core';
import { PathEscapeError } from '@ivkond-llm-wiki/core';

const OPERATIONS_DIR = '.local/operations' as const;
const JOURNAL_PATH = `${OPERATIONS_DIR}/journal.jsonl` as const;

export class FsOperationJournal implements IOperationJournal {
  private readonly normalizedRoot: string;
  private canonicalRootCache: string | undefined;
  private disabledReason: string | null = null;

  constructor(rootDir: string) {
    this.normalizedRoot = path.resolve(rootDir);
  }

  async append(record: OperationJournalRecord): Promise<void> {
    try {
      const safePath = this.resolveSafePath(JOURNAL_PATH);
      const parent = path.dirname(safePath);
      await this.assertAncestorSafe('.local');
      await this.assertAncestorSafe(OPERATIONS_DIR);
      await mkdir(parent, { recursive: true });
      const canonicalParent = await this.assertUnderRoot(parent, JOURNAL_PATH);
      if (canonicalParent === null) throw new PathEscapeError(JOURNAL_PATH);
      const targetPath = path.join(canonicalParent, path.basename(safePath));
      const existingCanonical = await this.assertUnderRoot(targetPath, JOURNAL_PATH);
      const appendTarget = existingCanonical ?? targetPath;
      const sanitizedRecord: OperationJournalRecord = {
        ...record,
        metadata: sanitizeOperationMetadata(record.metadata),
      };
      await appendFile(appendTarget, `${JSON.stringify(sanitizedRecord)}\n`, 'utf-8');
    } catch (error) {
      this.disabledReason = `operation journal append disabled: ${this.toReason(error)}`;
      throw error;
    }
  }

  private async assertAncestorSafe(relativePath: string): Promise<void> {
    const safePath = this.resolveSafePath(relativePath);
    const canonical = await this.assertUnderRoot(safePath, relativePath);
    if (canonical === null) return;
  }

  async load(): Promise<OperationJournalSnapshot> {
    const degradedReasons: string[] = [];
    const records: OperationJournalRecord[] = [];
    try {
      const safePath = this.resolveSafePath(JOURNAL_PATH);
      const canonical = await this.assertUnderRoot(safePath, JOURNAL_PATH);
      if (canonical === null) {
        return {
          storagePath: OPERATIONS_DIR,
          disabledReason: this.disabledReason,
          degradedReasons,
          records,
        };
      }
      const raw = await readFile(canonical, 'utf-8');
      const trailingPartial = raw.length > 0 && !raw.endsWith('\n');
      const lines = raw.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim() === '') continue;
        try {
          const parsed = JSON.parse(line) as OperationJournalRecord;
          records.push({
            ...parsed,
            metadata: sanitizeOperationMetadata(parsed.metadata),
          });
        } catch {
          degradedReasons.push(`malformed journal record at line ${index + 1}`);
        }
      }
      if (trailingPartial) {
        degradedReasons.push('trailing partial journal record detected');
      }
      return {
        storagePath: OPERATIONS_DIR,
        disabledReason: this.disabledReason,
        degradedReasons,
        records,
      };
    } catch (error) {
      const reason = this.toReason(error);
      this.disabledReason = `operation journal load disabled: ${reason}`;
      return {
        storagePath: OPERATIONS_DIR,
        disabledReason: this.disabledReason,
        degradedReasons,
        records,
      };
    }
  }

  private toReason(error: unknown): string {
    if (error instanceof Error && error.message.trim() !== '') return error.message;
    return String(error);
  }

  private resolveSafePath(relativePath: string): string {
    const resolved = path.resolve(this.normalizedRoot, relativePath);
    const rootWithSep = this.normalizedRoot.endsWith(path.sep)
      ? this.normalizedRoot
      : this.normalizedRoot + path.sep;
    if (resolved !== this.normalizedRoot && !resolved.startsWith(rootWithSep)) {
      throw new PathEscapeError(relativePath);
    }
    return resolved;
  }

  private async getCanonicalRoot(): Promise<string> {
    this.canonicalRootCache ??= await realpath(this.normalizedRoot);
    return this.canonicalRootCache;
  }

  private async assertUnderRoot(
    absolutePath: string,
    relativePath: string,
  ): Promise<string | null> {
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    const canonicalRoot = await this.getCanonicalRoot();
    const rootWithSep = canonicalRoot.endsWith(path.sep) ? canonicalRoot : canonicalRoot + path.sep;
    if (canonicalPath !== canonicalRoot && !canonicalPath.startsWith(rootWithSep)) {
      throw new PathEscapeError(relativePath);
    }
    return canonicalPath;
  }
}
