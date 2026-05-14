import { describe, expect, it } from 'vitest';
import { IngestPathViolationError } from '../../../src/domain/errors.js';
import { validateIngestTargetPath } from '../../../src/services/ingest/target-path-policy.js';

describe('validateIngestTargetPath', () => {
  it.each([
    'wiki/tools/postgresql.md',
    'wiki/a/b/c.md',
    'projects/cli-relay_v2/architecture.md',
  ])('accepts valid path: %s', (path) => {
    expect(() => validateIngestTargetPath(path)).not.toThrow();
  });

  it.each([
    'package.json',
    'docs/foo.md',
    'wiki/../x.md',
    '/etc/passwd',
    'wiki/foo.txt',
    'projects/foo.md',
    'projects/with space/foo.md',
    'wiki\\x.md',
    'wiki//x.md',
  ])('rejects invalid path: %s', (path) => {
    expect(() => validateIngestTargetPath(path)).toThrow(IngestPathViolationError);
  });
});
