export function coordinationOperation(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  const operation = (error as { operation?: unknown }).operation;
  if (
    (code === 'WRITE_LOCK_TIMEOUT' || code === 'WRITE_LOCK_ACQUISITION_FAILED') &&
    typeof operation === 'string'
  ) {
    return operation;
  }
  return null;
}
