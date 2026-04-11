import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, stat, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArchiveError } from '@llm-wiki/core';
import { SevenZipArchiver } from '../src/seven-zip-archiver.js';

describe('SevenZipArchiver', () => {
  it('creates a single archive containing all requested entries', async () => {
    const archiver = new SevenZipArchiver();
    const workdir = await mkdtemp(path.join(tmpdir(), 'archiver-'));
    try {
      const srcA = path.join(workdir, 'a.md');
      const srcB = path.join(workdir, 'b.md');
      await writeFile(srcA, 'alpha');
      await writeFile(srcB, 'beta');
      const archivePath = path.join(workdir, 'out.7z');

      const result = await archiver.createArchive(archivePath, [
        { sourcePath: srcA },
        { sourcePath: srcB },
      ]);

      expect(result.archivePath).toBe(archivePath);
      expect(result.fileCount).toBe(2);
      expect(result.bytes).toBeGreaterThan(0);
      const info = await stat(archivePath);
      expect(info.isFile()).toBe(true);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('rejects relative archivePath', async () => {
    const archiver = new SevenZipArchiver();
    const workdir = await mkdtemp(path.join(tmpdir(), 'archiver-'));
    try {
      const src = path.join(workdir, 'a.md');
      await writeFile(src, 'x');
      await expect(
        archiver.createArchive('relative/out.7z', [{ sourcePath: src }]),
      ).rejects.toBeInstanceOf(ArchiveError);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('throws ArchiveError when a source file does not exist', async () => {
    const archiver = new SevenZipArchiver();
    const workdir = await mkdtemp(path.join(tmpdir(), 'archiver-'));
    try {
      const missing = path.join(workdir, 'missing.md');
      const archivePath = path.join(workdir, 'out.7z');
      await expect(
        archiver.createArchive(archivePath, [{ sourcePath: missing }]),
      ).rejects.toBeInstanceOf(ArchiveError);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('rejects empty entry list and leaves no partial file', async () => {
    const archiver = new SevenZipArchiver();
    const workdir = await mkdtemp(path.join(tmpdir(), 'archiver-'));
    try {
      const archiveDir = path.join(workdir, 'out');
      await mkdir(archiveDir);
      const archivePath = path.join(archiveDir, 'out.7z');
      await expect(archiver.createArchive(archivePath, [])).rejects.toBeInstanceOf(ArchiveError);
      await expect(stat(archivePath)).rejects.toThrow();
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });
});
