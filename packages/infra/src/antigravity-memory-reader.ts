import { globby } from 'globby';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  AgentMemoryItem,
  type AgentMemoryDiscoveryOptions,
  type IAgentMemoryReader,
} from '@ivkond-llm-wiki/core';

const IDENTIFIER_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const MAX_SESSION_SOURCE = 120;

export class AntigravityMemoryReader implements IAgentMemoryReader {
  public readonly agent = 'antigravity';

  async discover(options: AgentMemoryDiscoveryOptions): Promise<AgentMemoryItem[]> {
    const files = await globby(options.paths, {
      absolute: true,
      dot: true,
      onlyFiles: true,
      suppressErrors: true,
    });

    const sinceMs = options.since ? Date.parse(options.since) : null;
    const items: AgentMemoryItem[] = [];

    for (const file of files) {
      let info;
      try {
        info = await stat(file);
      } catch {
        continue;
      }
      if (sinceMs !== null && info.mtime.getTime() <= sinceMs) continue;

      let raw: string;
      try {
        raw = await readFile(file, 'utf8');
      } catch {
        continue;
      }
      if (!raw.trim()) continue;

      const sessionId = this.sessionIdFromPath(file);
      const mtimeIso = info.mtime.toISOString();

      try {
        items.push(
          AgentMemoryItem.create({
            agent: this.agent,
            sourcePath: file,
            sessionId,
            content: raw,
            mtime: mtimeIso,
          }),
        );
      } catch {
        // Best-effort import: skip invalid files.
      }
    }

    return items;
  }

  private sessionIdFromPath(filePath: string): string {
    const normalized = filePath.replaceAll('\\', '/');
    const marker = normalized.includes('/.agents/rules/')
      ? '/.agents/rules/'
      : normalized.includes('/.agent/rules/')
        ? '/.agent/rules/'
        : null;
    const rel = marker ? normalized.split(marker).pop() ?? normalized : path.basename(normalized);
    const base = rel.replace(/\.md$/i, '').replaceAll('/', '-');
    const hadUnsafe = /[^a-zA-Z0-9_-]/.test(base);
    const safe = base.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');

    if (!hadUnsafe && safe.length <= MAX_SESSION_SOURCE && IDENTIFIER_SAFE.test(safe)) return safe;
    return `ag-${this.shortHash(rel)}`;
  }

  private shortHash(input: string): string {
    let hash = 0;
    for (const cp of input) {
      hash = Math.trunc((hash << 5) - hash + (cp.codePointAt(0) ?? 0));
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
