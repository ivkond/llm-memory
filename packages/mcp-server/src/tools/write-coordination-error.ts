export function isCoordinationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'WRITE_LOCK_TIMEOUT' || code === 'WRITE_LOCK_ACQUISITION_FAILED';
}
