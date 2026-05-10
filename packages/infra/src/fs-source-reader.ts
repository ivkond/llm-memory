import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  estimateTokens,
  SourceNotFoundError,
  SourceParseError,
  type ISourceReader,
  type SourceContent,
} from '@ivkond-llm-wiki/core';

/**
 * Reads local filesystem sources for `wiki_ingest`.
 *
 * Accepts three input forms:
 *   - `file:///absolute/path/to/foo.md` URI
 *   - absolute filesystem path (`/tmp/foo.md`)
 *   - relative filesystem path (resolved against `process.cwd()`)
 *
 * Missing files throw `SourceNotFoundError`. Directories are reported as
 * `SourceParseError` — this reader only deals with single files; a caller
 * that wants to crawl a directory should enumerate and feed each file in
 * separately.
 */
export class FsSourceReader implements ISourceReader {
  async read(uri: string): Promise<SourceContent> {
    const absPath = this.resolveToPath(uri);
    let stats;
    try {
      stats = await stat(absPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SourceNotFoundError(uri);
      }
      throw err;
    }
    if (stats.isDirectory()) {
      throw new SourceParseError(uri, 'source is a directory, expected a single file');
    }

    const content = await readFile(absPath, 'utf-8');
    return {
      uri: absPath,
      content,
      mimeType: this.mimeTypeFor(absPath),
      bytes: Buffer.byteLength(content, 'utf-8'),
      estimatedTokens: estimateTokens(content),
    };
  }

  private resolveToPath(uri: string): string {
    if (uri.startsWith('file://')) return fileURLToPath(uri);
    return path.isAbsolute(uri) ? uri : path.resolve(process.cwd(), uri);
  }

  private mimeTypeFor(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.md' || ext === '.markdown') return 'text/markdown';
    if (ext === '.html' || ext === '.htm') return 'text/html';
    if (ext === '.json') return 'application/json';
    return 'text/plain';
  }
}
