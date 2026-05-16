import { globby } from 'globby';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  AgentMemoryItem,
  type IAgentMemoryReader,
  type AgentMemoryDiscoveryOptions,
} from '@ivkond-llm-wiki/core';

const IDENTIFIER_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export class KiroMemoryReader implements IAgentMemoryReader {
  public readonly agent = 'kiro';

  async discover(options: AgentMemoryDiscoveryOptions): Promise<AgentMemoryItem[]> {
    const files = await globby(options.paths, {
      absolute: true,
      dot: false,
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

      const content = raw.trim();
      if (!content) continue;

      const basename = path.basename(file, '.md');
      if (!IDENTIFIER_SAFE.test(basename)) continue;

      try {
        items.push(
          AgentMemoryItem.create({
            agent: this.agent,
            sourcePath: file,
            sessionId: basename,
            content,
            mtime: info.mtime.toISOString(),
          }),
        );
      } catch {
        // Best-effort import: ignore malformed items.
      }
    }

    return items;
  }
}
