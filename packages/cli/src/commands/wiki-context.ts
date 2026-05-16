import path from 'node:path';

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
