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
