import { globby } from 'globby';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  AgentMemoryItem,
  type IAgentMemoryReader,
  type AgentMemoryDiscoveryOptions,
} from '@ivkond-llm-wiki/core';

const IDENTIFIER_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export class QwenCodeMemoryReader implements IAgentMemoryReader {
  public readonly agent = 'qwen-code';

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
      if (path.extname(file).toLowerCase() !== '.md') continue;

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
      if (!raw.trim()) continue;

      const project = this.pickProject(file);
      const sessionId = this.pickSessionId(file, project);
      if (!sessionId) continue;

      try {
        items.push(
          AgentMemoryItem.create({
            agent: this.agent,
            sourcePath: file,
            sessionId,
            project: project ?? undefined,
            content: raw,
            mtime: mtimeIso,
          }),
        );
      } catch {
        // Invalid identifier or missing field — skip; import is best-effort.
      }
    }

    return items;
  }

  private pickProject(filePath: string): string | null {
    const marker = `${path.sep}projects${path.sep}`;
    const idx = filePath.indexOf(marker);
    if (idx < 0) return null;
    const after = filePath.slice(idx + marker.length);
    const projectSegment = after.split(path.sep)[0] ?? '';
    const normalized = this.normalizeIdentifier(projectSegment);
    return normalized ?? null;
  }

  private pickSessionId(filePath: string, project: string | null): string | null {
    const base = path.basename(filePath, '.md');
    const fromFile = this.normalizeIdentifier(base);
    if (fromFile) return fromFile;

    const digest = this.stableHash(filePath).slice(0, 16);
    const fallback = project ? `qwen-${project}-${digest}` : `qwen-${digest}`;
    return this.normalizeIdentifier(fallback);
  }

  private normalizeIdentifier(raw: string): string | null {
    if (!raw) return null;
    const folded = raw
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '');
    if (!folded) return null;
    const trimmed = folded.slice(0, 64);
    if (IDENTIFIER_SAFE.test(trimmed)) return trimmed;
    return null;
  }

  private stableHash(input: string): string {
    let hash = 0;
    for (const cp of input) {
      hash = Math.trunc((hash << 5) - hash + (cp.codePointAt(0) ?? 0));
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
