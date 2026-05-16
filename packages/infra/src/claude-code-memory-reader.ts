import { globby } from 'globby';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import {
  AgentMemoryItem,
  type IAgentMemoryReader,
  type AgentMemoryDiscoveryOptions,
} from '@ivkond-llm-wiki/core';

const IDENTIFIER_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export class ClaudeCodeMemoryReader implements IAgentMemoryReader {
  public readonly agent = 'claude-code';

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
      const mtimeIso = info.mtime.toISOString();
      if (sinceMs !== null && info.mtime.getTime() <= sinceMs) continue;

      let raw: string;
      try {
        raw = await readFile(file, 'utf8');
      } catch {
        continue;
      }

      const parsed = matter(raw);
      const basename = path.basename(file, '.md');
      const sessionId = this.pickSessionId(parsed.data, basename);
      if (!sessionId) continue;
      const project = this.pickProject(parsed.data);
      const content = parsed.content.trim() || raw.trim();
      if (!content) continue;

      try {
        const sourceDigest = ClaudeCodeMemoryReader.stableHash(`${file}|${raw}`);
        items.push(
          AgentMemoryItem.create({
            agent: this.agent,
            sourcePath: file,
            sourceType: 'claude-code-memory',
            sourceUri: file,
            sourceDigest,
            sourceMtime: mtimeIso,
            sessionId,
            project,
            content,
            mtime: mtimeIso,
          }),
        );
      } catch {
        // Invalid identifier or missing field — skip; import is best-effort.
      }
    }

    return items;
  }

  private pickSessionId(data: Record<string, unknown>, basename: string): string | null {
    const fromFm = typeof data.session === 'string' ? data.session : null;
    if (fromFm && IDENTIFIER_SAFE.test(fromFm)) return fromFm;
    const match = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(basename);
    if (match && IDENTIFIER_SAFE.test(match[1])) return match[1];
    if (IDENTIFIER_SAFE.test(basename)) return basename;
    return null;
  }

  private pickProject(data: Record<string, unknown>): string | undefined {
    if (typeof data.project === 'string' && IDENTIFIER_SAFE.test(data.project)) {
      return data.project;
    }
    return undefined;
  }

  private static stableHash(input: string): string {
    let hash = 0;
    for (const cp of input) {
      hash = Math.trunc((hash << 5) - hash + (cp.codePointAt(0) ?? 0));
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
