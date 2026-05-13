import { IngestPathViolationError } from '../../domain/errors.js';

/** Project identifier shape — mirrors InvalidIdentifierError's regex. */
const PROJECT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * Validate that an LLM-provided page path is a safe ingest target.
 */
export function validateIngestTargetPath(requestedPath: string): void {
  if (typeof requestedPath !== 'string' || requestedPath.length === 0) {
    throw new IngestPathViolationError(requestedPath, 'path must be a non-empty string');
  }
  if (requestedPath.includes('\\')) {
    throw new IngestPathViolationError(requestedPath, 'path must not contain backslashes');
  }
  if (requestedPath.startsWith('/')) {
    throw new IngestPathViolationError(requestedPath, 'path must be relative');
  }
  if (/\0/.test(requestedPath)) {
    throw new IngestPathViolationError(requestedPath, 'path must not contain NUL bytes');
  }

  const segments = requestedPath.split('/');
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') {
      throw new IngestPathViolationError(requestedPath, `invalid segment "${seg}"`);
    }
  }

  if (!requestedPath.endsWith('.md')) {
    throw new IngestPathViolationError(requestedPath, 'path must have a .md extension');
  }

  if (segments[0] === 'wiki') {
    if (segments.length < 2) {
      throw new IngestPathViolationError(
        requestedPath,
        'wiki path must be wiki/<file>.md or deeper',
      );
    }
    return;
  }

  if (segments[0] === 'projects') {
    if (segments.length < 3) {
      throw new IngestPathViolationError(
        requestedPath,
        'projects path must be projects/<name>/<file>.md',
      );
    }
    if (!PROJECT_NAME_RE.test(segments[1])) {
      throw new IngestPathViolationError(requestedPath, `invalid project name "${segments[1]}"`);
    }
    return;
  }

  throw new IngestPathViolationError(requestedPath, 'path must start with wiki/ or projects/<name>/');
}
