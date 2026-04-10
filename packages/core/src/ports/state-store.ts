import type { WikiRuntimeState } from '../domain/runtime-state.js';

export interface IStateStore {
  /** Load runtime state. Returns defaults if the state file is missing. */
  load(): Promise<WikiRuntimeState>;

  /** Overwrite runtime state atomically. */
  save(state: WikiRuntimeState): Promise<void>;

  /** Shallow-merge a patch, persist, and return the new state. */
  update(patch: Partial<WikiRuntimeState>): Promise<WikiRuntimeState>;
}
