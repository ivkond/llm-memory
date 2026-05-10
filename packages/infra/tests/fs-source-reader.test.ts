import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsSourceReader } from '../src/fs-source-reader.js';
import { SourceNotFoundError, estimateTokens } from '@ivkond-llm-wiki/core';

describe('FsSourceReader', () => {
  let dir: string;
  let reader: FsSourceReader;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-fs-src-'));
    reader = new FsSourceReader();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('test_read_localMarkdownFile_returnsContentAndMetadata', async () => {
    const filePath = path.join(dir, 'article.md');
    const body = '# Title\n\nSome body text.\n';
    await writeFile(filePath, body, 'utf-8');

    const source = await reader.read(filePath);
    expect(source.uri).toBe(filePath);
    expect(source.content).toBe(body);
    expect(source.mimeType).toBe('text/markdown');
    expect(source.bytes).toBe(Buffer.byteLength(body, 'utf-8'));
    expect(source.estimatedTokens).toBe(estimateTokens(body));
  });

  it('test_read_missingFile_throwsSourceNotFound', async () => {
    await expect(reader.read(path.join(dir, 'nope.md'))).rejects.toBeInstanceOf(
      SourceNotFoundError,
    );
  });

  it('test_read_nonMarkdown_returnsGenericMimeType', async () => {
    const filePath = path.join(dir, 'notes.txt');
    await writeFile(filePath, 'plain\n', 'utf-8');
    const source = await reader.read(filePath);
    expect(source.mimeType).toBe('text/plain');
  });

  it('test_read_fileUriScheme_resolvesFromFileUrl', async () => {
    const filePath = path.join(dir, 'article.md');
    await writeFile(filePath, 'body', 'utf-8');
    const source = await reader.read(`file://${filePath}`);
    expect(source.content).toBe('body');
  });

  it('test_read_relativePath_resolvesAgainstCwd', async () => {
    const sub = path.join(dir, 'inner');
    await mkdir(sub, { recursive: true });
    const filePath = path.join(sub, 'x.md');
    await writeFile(filePath, 'relative body', 'utf-8');

    const originalCwd = process.cwd();
    process.chdir(sub);
    try {
      const source = await reader.read('x.md');
      expect(source.content).toBe('relative body');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
