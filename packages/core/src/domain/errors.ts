export class WikiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WikiError';
  }
}

export class ContentEmptyError extends WikiError {
  constructor() {
    super('CONTENT_EMPTY', 'Content must not be empty');
  }
}

export class SanitizationBlockedError extends WikiError {
  constructor(public readonly redactedRatio: number) {
    super(
      'SANITIZATION_BLOCKED',
      `Content is ${Math.round(redactedRatio * 100)}% redacted — likely a credentials dump`,
    );
  }
}

export class WikiNotInitializedError extends WikiError {
  constructor(path: string) {
    super('WIKI_NOT_INITIALIZED', `Wiki not initialized at ${path}`);
  }
}

export class WikiEmptyError extends WikiError {
  constructor() {
    super('WIKI_EMPTY', 'No pages exist in the wiki');
  }
}

export class PathEscapeError extends WikiError {
  constructor(public readonly attemptedPath: string) {
    super('PATH_ESCAPE', `Path escapes wiki root: ${attemptedPath}`);
  }
}

export class InvalidIdentifierError extends WikiError {
  constructor(
    public readonly field: string,
    public readonly value: string,
  ) {
    super(
      'INVALID_IDENTIFIER',
      `Invalid ${field}: ${JSON.stringify(value)} — must match [a-zA-Z0-9][a-zA-Z0-9_-]{0,63}`,
    );
  }
}

export class InvalidPatternError extends WikiError {
  constructor(
    public readonly pattern: string,
    public readonly reason: string,
  ) {
    super('INVALID_PATTERN', `Invalid sanitization pattern ${JSON.stringify(pattern)}: ${reason}`);
  }
}

export class SearchEmptyError extends WikiError {
  constructor(public readonly question: string) {
    super('SEARCH_EMPTY', `No search results for query: ${JSON.stringify(question)}`);
  }
}

export class LlmUnavailableError extends WikiError {
  constructor(message: string) {
    super('LLM_UNAVAILABLE', `LLM unavailable: ${message}`);
  }
}

export class GitConflictError extends WikiError {
  constructor(
    public readonly worktreePath: string,
    message?: string,
  ) {
    super(
      'GIT_CONFLICT',
      message
        ? `Git merge conflict in ${worktreePath}: ${message}`
        : `Git merge conflict in ${worktreePath}`,
    );
  }
}

export class SourceNotFoundError extends WikiError {
  constructor(public readonly uri: string) {
    super('SOURCE_NOT_FOUND', `Source not found: ${uri}`);
  }
}

export class SourceParseError extends WikiError {
  constructor(
    public readonly uri: string,
    public readonly reason: string,
  ) {
    super('SOURCE_PARSE_ERROR', `Failed to parse source ${uri}: ${reason}`);
  }
}

export class IngestPathViolationError extends WikiError {
  constructor(
    public readonly attemptedPath: string,
    public readonly reason: string,
  ) {
    super(
      'INGEST_PATH_VIOLATION',
      `Ingest target path ${JSON.stringify(attemptedPath)} is not allowed: ${reason}`,
    );
  }
}

export class ArchiveError extends WikiError {
  constructor(
    public readonly target: string,
    message: string,
  ) {
    super('ARCHIVE_ERROR', `Failed to archive ${target}: ${message}`);
  }
}

export class ImportReaderNotRegisteredError extends WikiError {
  constructor(public readonly agent: string) {
    super('IMPORT_READER_NOT_REGISTERED', `No IAgentMemoryReader registered for agent "${agent}"`);
  }
}

export class LintPhaseError extends WikiError {
  constructor(
    public readonly phase: string,
    message: string,
  ) {
    super('LINT_PHASE_ERROR', `Lint phase "${phase}" failed: ${message}`);
  }
}

export class ProjectScopeUnsupportedError extends WikiError {
  constructor(
    public readonly operation: 'ingest' | 'lint',
    public readonly project: string,
  ) {
    super(
      'PROJECT_SCOPE_UNSUPPORTED',
      `Operation "${operation}" does not support project-scoped execution yet: ${JSON.stringify(project)}`,
    );
  }
}

export class InvalidIdempotencyKeyError extends WikiError {
  constructor(public readonly value: string) {
    super(
      'INVALID_IDEMPOTENCY_KEY',
      `Invalid idempotency key: ${JSON.stringify(value)} — must match [a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}`,
    );
  }
}

export class IdempotencyConflictError extends WikiError {
  constructor(
    public readonly operation: string,
    public readonly key: string,
  ) {
    super(
      'IDEMPOTENCY_CONFLICT',
      `Idempotency conflict for operation "${operation}" and key ${JSON.stringify(key)}`,
    );
  }
}
