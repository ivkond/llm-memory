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
