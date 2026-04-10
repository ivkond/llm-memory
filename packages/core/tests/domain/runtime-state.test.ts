import { describe, it, expect } from 'vitest';
import { EMPTY_RUNTIME_STATE, type WikiRuntimeState } from '../../src/domain/runtime-state.js';

describe('WikiRuntimeState', () => {
  it('test_emptyRuntimeState_hasExpectedDefaults', () => {
    expect(EMPTY_RUNTIME_STATE.imports).toEqual({});
    expect(EMPTY_RUNTIME_STATE.last_lint).toBeNull();
    expect(EMPTY_RUNTIME_STATE.last_ingest).toBeNull();
  });

  it('test_emptyRuntimeState_isPlainData_noMethods', () => {
    const state: WikiRuntimeState = EMPTY_RUNTIME_STATE;
    // Plain object: only its enumerable own keys, nothing on the prototype.
    expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
    expect(Object.keys(state).sort()).toEqual(['imports', 'last_ingest', 'last_lint']);
  });

  it('test_runtimeState_supportsImportRecord', () => {
    const state: WikiRuntimeState = {
      imports: {
        'docs.example.com': { last_import: '2026-04-10T00:00:00Z' },
      },
      last_lint: null,
      last_ingest: '2026-04-10T00:00:00Z',
    };
    expect(state.imports['docs.example.com'].last_import).toBe('2026-04-10T00:00:00Z');
    expect(state.last_ingest).toBe('2026-04-10T00:00:00Z');
  });
});
