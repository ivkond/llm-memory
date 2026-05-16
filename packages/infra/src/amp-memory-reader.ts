import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AgentMemoryItem, type AgentMemoryDiscoveryOptions, type IAgentMemoryReader } from '@ivkond-llm-wiki/core';

const ALLOWED_FILENAMES = new Set(['AGENTS.md', 'AGENT.md', 'CLAUDE.md']);
const GLOB_META = /[*?[\]{}!]/;

export class AmpMemoryReader implements IAgentMemoryReader {
  public readonly agent = 'amp';

  async discover(options: AgentMemoryDiscoveryOptions): Promise<AgentMemoryItem[]> {
    const sinceMs = options.since ? Date.parse(options.since) : null;
    const items: AgentMemoryItem[] = [];

    for (const configuredPath of options.paths) {
      if (this.hasGlobMeta(configuredPath)) continue;
      const parsedPath = this.normalizeFilePath(configuredPath);
      if (!parsedPath) continue;
      if (!path.isAbsolute(parsedPath)) continue;
      if (!ALLOWED_FILENAMES.has(path.basename(parsedPath))) continue;

      let info;
      try {
        info = await stat(parsedPath);
      } catch {
        continue;
      }
      if (sinceMs !== null && info.mtime.getTime() <= sinceMs) continue;

      let raw: string;
      try {
        raw = await readFile(parsedPath, 'utf8');
      } catch {
        continue;
      }
      if (!raw.trim()) continue;

      const digest = createHash('sha1').update(parsedPath).digest('hex').slice(0, 16);
      const project = this.extractProjectHint(parsedPath);
      try {
        items.push(
          AgentMemoryItem.create({
            agent: this.agent,
            sourcePath: parsedPath,
            sessionId: `doc_${digest}`,
            project,
            content: raw,
            mtime: info.mtime.toISOString(),
          }),
        );
      } catch {
        // best effort import; skip malformed entries
      }
    }

    return items;
  }

  private normalizeFilePath(input: string): string | null {
    if (input.startsWith('http://') || input.startsWith('https://')) return null;
    if (input.startsWith('file://')) {
      try {
        return new URL(input).pathname;
      } catch {
        return null;
      }
    }
    return input;
  }

  private hasGlobMeta(input: string): boolean {
    return GLOB_META.test(input);
  }

  private extractProjectHint(filePath: string): string | undefined {
    const normalized = filePath.replaceAll('\\', '/');
    const marker = '/projects/';
    const idx = normalized.lastIndexOf(marker);
    if (idx < 0) return undefined;
    const rest = normalized.slice(idx + marker.length);
    const name = rest.split('/')[0] ?? '';
    if (/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) return name;
    return undefined;
  }
}
