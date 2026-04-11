import { add } from 'node-7z';
import sevenBin from '7zip-bin';
import { stat, unlink, mkdir, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ArchiveError,
  type IArchiver,
  type ArchiveEntry,
  type ArchiveResult,
} from '@llm-wiki/core';

/**
 * IArchiver adapter backed by the statically-linked 7-Zip binary shipped by
 * the `7zip-bin` package. We drive it via `node-7z` which returns a stream
 * of progress events — we resolve on `end`, reject on `error`.
 *
 * Atomicity + cumulative semantics: we first copy any existing archive at
 * `archivePath` to `<archivePath>.tmp`, then let `7za a` add the new
 * entries to the temp file, then rename on success. This gives us two
 * guarantees at once:
 *   - atomicity: on any failure we unlink the temp file so callers never
 *     see a partial archive at `archivePath`;
 *   - accumulation: a second call against the same `archivePath` does NOT
 *     clobber the previous archive's contents. Under the wiki_lint
 *     pipeline `archivePath` is stable for a whole calendar month per
 *     agent (`YYYY-MM-<agent>.7z`), so two successful lint runs in the
 *     same month must both contribute their verbatim batches to the
 *     same backup file. Without the pre-copy, the second run would
 *     replace the first run's snapshots — operational data loss.
 * node-7z refuses to add empty file lists, so the pre-check below turns
 * that into an `ArchiveError` before we touch the filesystem.
 *
 * The adapter rejects relative `archivePath` values up front — process
 * CWD is not a stable anchor across CLI, MCP server, and test runners,
 * so every caller in the codebase MUST compute an absolute target.
 *
 * In-archive layout is whatever node-7z produces by default (full source
 * paths collapsed to a common prefix). Callers must not rely on a specific
 * sub-path inside the archive.
 */
export class SevenZipArchiver implements IArchiver {
  private readonly binaryPath: string;

  constructor(binaryPath: string = sevenBin.path7za) {
    this.binaryPath = binaryPath;
  }

  async createArchive(archivePath: string, entries: ArchiveEntry[]): Promise<ArchiveResult> {
    if (!path.isAbsolute(archivePath)) {
      throw new ArchiveError(archivePath, 'archivePath must be absolute');
    }
    if (entries.length === 0) {
      throw new ArchiveError(archivePath, 'no entries provided');
    }
    for (const entry of entries) {
      if (!path.isAbsolute(entry.sourcePath)) {
        throw new ArchiveError(
          archivePath,
          `entry.sourcePath must be absolute: ${entry.sourcePath}`,
        );
      }
      try {
        await stat(entry.sourcePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new ArchiveError(archivePath, `source missing: ${entry.sourcePath} (${message})`);
      }
    }

    await mkdir(path.dirname(archivePath), { recursive: true });
    const tmpPath = `${archivePath}.tmp`;
    await this.safeUnlink(tmpPath);

    // If an archive already exists at the target, seed the tmp file with
    // its contents so `7za a` appends the new entries rather than building
    // a fresh archive from scratch. Missing target is fine — first run.
    try {
      await copyFile(archivePath, tmpPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        const message = err instanceof Error ? err.message : String(err);
        throw new ArchiveError(archivePath, `failed to seed tmp archive: ${message}`);
      }
    }

    const sourcePaths = entries.map((e) => e.sourcePath);

    try {
      await new Promise<void>((resolve, reject) => {
        const stream = add(tmpPath, sourcePaths, {
          $bin: this.binaryPath,
          $raw: ['-t7z', '-mx=5'],
        });
        stream.on('error', (err: Error) => reject(err));
        stream.on('end', () => resolve());
      });
    } catch (err) {
      await this.safeUnlink(tmpPath);
      const message = err instanceof Error ? err.message : String(err);
      throw new ArchiveError(archivePath, message);
    }

    try {
      await rename(tmpPath, archivePath);
    } catch (err) {
      await this.safeUnlink(tmpPath);
      const message = err instanceof Error ? err.message : String(err);
      throw new ArchiveError(archivePath, `rename failed: ${message}`);
    }

    const info = await stat(archivePath);
    return {
      archivePath,
      fileCount: entries.length,
      bytes: info.size,
    };
  }

  private async safeUnlink(target: string): Promise<void> {
    try {
      await unlink(target);
    } catch {
      // swallow ENOENT and friends — nothing to clean up
    }
  }
}
