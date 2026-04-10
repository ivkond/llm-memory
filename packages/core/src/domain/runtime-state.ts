export interface ImportState {
  last_import: string | null;
}

export interface WikiRuntimeState {
  imports: Record<string, ImportState>;
  last_lint: string | null;
  last_ingest: string | null;
}

export const EMPTY_RUNTIME_STATE: WikiRuntimeState = {
  imports: {},
  last_lint: null,
  last_ingest: null,
};
