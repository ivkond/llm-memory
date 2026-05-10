import yaml from 'js-yaml';
import {
  EMPTY_RUNTIME_STATE,
  type IFileStore,
  type IStateStore,
  type WikiRuntimeState,
} from '@ivkond-llm-wiki/core';

const STATE_PATH = '.local/state.yaml';

/**
 * Persists `WikiRuntimeState` to `.local/state.yaml` via an injected
 * `IFileStore`. Reusing `IFileStore` (rather than owning a filesystem
 * handle directly) gives us the same path-escape guard and symlink-aware
 * write checks that `FsFileStore` already enforces.
 *
 * `.local/` is intentionally outside of `wiki/` and `projects/` so it is
 * excluded from `wiki_recall` listings — runtime state is an operational
 * artifact, not a wiki page.
 *
 * Concurrent `update()` calls are serialised with a simple chained-promise
 * mutex so two parallel writes never drop each other's patch.
 */
export class YamlStateStore implements IStateStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly fileStore: IFileStore) {}

  async load(): Promise<WikiRuntimeState> {
    const raw = await this.fileStore.readFile(STATE_PATH);
    if (raw === null || raw.trim() === '') {
      return structuredClone(EMPTY_RUNTIME_STATE);
    }
    const parsed = yaml.load(raw);
    if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
      return structuredClone(EMPTY_RUNTIME_STATE);
    }
    return this.normalise(parsed as Partial<WikiRuntimeState>);
  }

  async save(state: WikiRuntimeState): Promise<void> {
    // Chain all writes so that save() and update() share the same serial
    // ordering. Without this, parallel update() calls could read the same
    // snapshot, each merge their own patch, and the later write would
    // silently overwrite the earlier one.
    const next = this.writeChain.then(() => this.writeUnsafe(state));
    this.writeChain = next.catch(() => undefined);
    await next;
  }

  async update(patch: Partial<WikiRuntimeState>): Promise<WikiRuntimeState> {
    // Serialised read-modify-write: the mutex guarantees no interleaving.
    const next = this.writeChain.then(async () => {
      const current = await this.load();
      const merged: WikiRuntimeState = { ...current, ...patch };
      await this.writeUnsafe(merged);
      return merged;
    });
    this.writeChain = next.then(() => undefined).catch(() => undefined);
    return next;
  }

  /** Writes the state file. Callers must hold the mutex. */
  private async writeUnsafe(state: WikiRuntimeState): Promise<void> {
    const body = yaml.dump(state, { noRefs: true, sortKeys: true });
    await this.fileStore.writeFile(STATE_PATH, body);
  }

  /** Coerce an arbitrarily-shaped parsed YAML object into a well-formed
   *  WikiRuntimeState, preserving any unknown keys' absence. */
  private normalise(parsed: Partial<WikiRuntimeState>): WikiRuntimeState {
    return {
      imports: parsed.imports ?? {},
      last_lint: parsed.last_lint ?? null,
      last_ingest: parsed.last_ingest ?? null,
    };
  }
}
