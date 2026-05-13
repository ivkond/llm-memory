import type {
  RememberService,
  RecallService,
  QueryService,
  IngestService,
  WikiStatusService,
  LintService,
  ImportService,
  RecoveryDiagnosticsService,
} from '@ivkond-llm-wiki/core';

/**
 * Application-level service container assembled by the composition root
 * (`buildContainer`). Transports (MCP server, CLI) consume this contract
 * and must not depend on `@ivkond-llm-wiki/infra` directly.
 *
 * `import_` has a trailing underscore because `import` is a reserved word
 * in ES modules; the shape stays named-export-only without `as` renames.
 */
export interface AppServices {
  readonly remember: RememberService;
  readonly recall: RecallService;
  readonly query: QueryService;
  readonly ingest: IngestService;
  readonly status: WikiStatusService;
  readonly lint: LintService;
  readonly import_: ImportService;
  readonly recovery: RecoveryDiagnosticsService;
}
