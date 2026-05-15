import { globby } from 'globby';
import { readFile, stat } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  AgentMemoryItem,
  type IAgentMemoryReader,
  type AgentMemoryDiscoveryOptions,
} from '@ivkond-llm-wiki/core';

const MAX_IDENTIFIER_LEN = 64;
const HASH_LEN = 12;

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

      const sessionId = this.makeSessionId(file);
      const mtimeIso = info.mtime.toISOString();
      const project = this.pickProject(file);

      try {
        items.push(
          AgentMemoryItem.create({
            agent: this.agent,
            sourcePath: file,
            sessionId,
            project,
            content: raw,
            mtime: mtimeIso,
          }),
        );
      } catch {
        // Best-effort import; invalid items are skipped.
      }
    }

    return items;
  }

  private makeSessionId(file: string): string {
    const relative = this.ruleRelativePath(file);
    const normalized = relative.replaceAll('\\', '/').replaceAll('/', '-');
    const basename = normalized.replace(/\.md$/i, '');
    const safe = basename
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (safe && safe.length <= MAX_IDENTIFIER_LEN && /^[a-zA-Z0-9]/.test(safe)) {
      return safe;
    }

    const hash = crypto.createHash('sha1').update(relative).digest('hex').slice(0, HASH_LEN);
    const prefix = safe.replace(/^[^a-zA-Z0-9]+/, '') || 'rule';
    const clipped = prefix.slice(0, Math.max(1, MAX_IDENTIFIER_LEN - 1 - HASH_LEN));
    return `${clipped}-${hash}`;
  }

  private ruleRelativePath(file: string): string {
    const normalized = file.replaceAll('\\', '/');
    const modernMarker = '/.agents/rules/';
    const legacyMarker = '/.agent/rules/';
    const modernIdx = normalized.lastIndexOf(modernMarker);
    if (modernIdx >= 0) return normalized.slice(modernIdx + modernMarker.length);
    const legacyIdx = normalized.lastIndexOf(legacyMarker);
    if (legacyIdx >= 0) return normalized.slice(legacyIdx + legacyMarker.length);
    return path.basename(normalized);
  }

  private pickProject(file: string): string | undefined {
    const normalized = file.replaceAll('\\', '/');
    const marker = '/.agents/rules/';
    const legacy = '/.agent/rules/';
    const idx = normalized.lastIndexOf(marker);
    const altIdx = normalized.lastIndexOf(legacy);
    const cut = idx >= 0 ? idx : altIdx;
    if (cut < 0) return undefined;
    const root = normalized.slice(0, cut);
    const name = path.basename(root);
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name) ? name : undefined;
  }
}
