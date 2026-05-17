import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsWriteCoordinator } from '../src/fs-write-coordinator.js';
import { WriteLockTimeoutError } from '@ivkond-llm-wiki/core';

describe('FsWriteCoordinator', () => {
  it('serializes concurrent operations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fs-write-coordinator-'));
    const coordinator = new FsWriteCoordinator(root, { timeoutMs: 2000, retryDelayMs: 10 });
    const order: string[] = [];

    try {
      await Promise.all([
        coordinator.runExclusive({ name: 'one' }, async () => {
          order.push('one-start');
          await new Promise((resolve) => setTimeout(resolve, 50));
          order.push('one-end');
        }),
        coordinator.runExclusive({ name: 'two' }, async () => {
          order.push('two-start');
          order.push('two-end');
        }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }

    expect(order).toHaveLength(4);
    expect(order.indexOf('one-start')).toBeLessThan(order.indexOf('one-end'));
    expect(order.indexOf('two-start')).toBeLessThan(order.indexOf('two-end'));
    const oneRange = [order.indexOf('one-start'), order.indexOf('one-end')] as const;
    const twoRange = [order.indexOf('two-start'), order.indexOf('two-end')] as const;
    const nonOverlapping = oneRange[1] < twoRange[0] || twoRange[1] < oneRange[0];
    expect(nonOverlapping).toBe(true);
  });

  it('times out when a fresh lock is held', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fs-write-coordinator-'));
    const lockDir = path.join(root, '.llm-memory', 'write.lock');
    await mkdir(lockDir, { recursive: true });
    const coordinator = new FsWriteCoordinator(root, { timeoutMs: 50, retryDelayMs: 10, staleMs: 5000 });
    try {
      await expect(
        coordinator.runExclusive({ name: 'blocked' }, async () => undefined),
      ).rejects.toBeInstanceOf(WriteLockTimeoutError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recovers stale lock and proceeds', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fs-write-coordinator-'));
    const lockDir = path.join(root, '.llm-memory', 'write.lock');
    await mkdir(lockDir, { recursive: true });
    const staleTime = new Date(Date.now() - 10_000);
    await utimes(lockDir, staleTime, staleTime);
    const coordinator = new FsWriteCoordinator(root, { timeoutMs: 1000, retryDelayMs: 10, staleMs: 100 });
    try {
      await coordinator.runExclusive({ name: 'stale-recovery' }, async () => undefined);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not preempt an active holder even when operation exceeds staleMs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fs-write-coordinator-'));
    const coordinator = new FsWriteCoordinator(root, {
      timeoutMs: 2000,
      retryDelayMs: 5,
      staleMs: 40,
      heartbeatMs: 10,
    });
    const order: string[] = [];

    try {
      await Promise.all([
        coordinator.runExclusive({ name: 'long' }, async () => {
          order.push('long-start');
          await new Promise((resolve) => setTimeout(resolve, 120));
          order.push('long-end');
        }),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          await coordinator.runExclusive({ name: 'waiter' }, async () => {
            order.push('waiter-start');
            order.push('waiter-end');
          });
        })(),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }

    expect(order).toEqual(['long-start', 'long-end', 'waiter-start', 'waiter-end']);
  });

  it('release is owner-aware and does not remove a lock replaced by another owner', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fs-write-coordinator-'));
    const lockDir = path.join(root, '.llm-memory', 'write.lock');
    const metadataFile = path.join(lockDir, 'metadata.json');
    const coordinator = new FsWriteCoordinator(root, { timeoutMs: 1000, retryDelayMs: 5 });

    try {
      await coordinator.runExclusive({ name: 'first' }, async () => {
        await rm(lockDir, { recursive: true, force: true });
        await mkdir(lockDir, { recursive: true });
        await writeFile(
          metadataFile,
          JSON.stringify({
            ownerId: 'second-owner',
            pid: process.pid,
            operation: 'second',
            startedAt: new Date().toISOString(),
            heartbeatAt: new Date().toISOString(),
          }),
          'utf8',
        );
      });
      const metadataRaw = await readFile(metadataFile, 'utf8');
      const metadata = JSON.parse(metadataRaw) as { ownerId: string };
      expect(metadata.ownerId).toBe('second-owner');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('release does not remove lock when ownership metadata is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fs-write-coordinator-'));
    const lockDir = path.join(root, '.llm-memory', 'write.lock');
    const metadataFile = path.join(lockDir, 'metadata.json');
    const coordinator = new FsWriteCoordinator(root, { timeoutMs: 1000, retryDelayMs: 5 });

    try {
      await coordinator.runExclusive({ name: 'owner-a' }, async () => {
        // Simulate a handoff window where another process just acquired
        // `write.lock` but has not written metadata yet.
        await rm(metadataFile, { force: true });
        await rm(lockDir, { recursive: true, force: true });
        await mkdir(lockDir, { recursive: true });
      });
      const lockStats = await stat(lockDir);
      expect(lockStats.isDirectory()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
