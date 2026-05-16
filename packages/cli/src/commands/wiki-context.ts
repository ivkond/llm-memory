import path from 'node:path';
import type { AppServices } from '@ivkond-llm-wiki/common';
import { buildContainer } from '@ivkond-llm-wiki/common';
import { ConfigLoader } from '@ivkond-llm-wiki/infra';

export async function findWikiRoot(): Promise<string | null> {
  const candidates = [process.cwd(), path.join(process.env.HOME ?? '', '.llm-wiki')];
  for (const candidate of candidates) {
    try {
      const configPath = path.join(candidate, '.config', 'settings.shared.yaml');
      const { access } = await import('node:fs/promises');
      await access(configPath);
      return candidate;
    } catch {
      // Config not found here, continue.
    }
  }
  return null;
}

export function toOptionalCliString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return undefined;
}

export function printIdempotencyReplay(isReplayed: boolean | undefined, idempotencyKey?: string): void {
  if (isReplayed && idempotencyKey) {
    console.log(`Replayed idempotent result for key ${idempotencyKey}`);
  }
}

export function exitNoWiki(): never {
  console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
  console.error('Run "llm-wiki init" first, or use --wiki to specify the path');
  process.exit(1);
}

export function exitWithError(error: unknown, verbose: boolean): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\x1b[31m%s\x1b[0m', `Error: ${message}`);
  if (verbose) {
    console.error(error);
  }
  process.exit(1);
}

export async function resolveWikiPath(wikiOption?: string): Promise<string> {
  const wikiPath = wikiOption ?? (await findWikiRoot());
  if (!wikiPath) {
    exitNoWiki();
  }
  return wikiPath;
}

export async function loadServicesForWiki(wikiPath: string): Promise<AppServices> {
  const configLoader = new ConfigLoader(wikiPath);
  const config = await configLoader.load();
  return buildContainer(config);
}
