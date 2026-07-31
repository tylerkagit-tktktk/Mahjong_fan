export type CloudFailureKind = 'quota' | 'offline' | 'permission' | 'unknown';

export type CloudFailure = {
  kind: CloudFailureKind;
  code: string;
  retryable: boolean;
};

function normalizeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return '';
  }
  const code = String((error as { code?: unknown }).code ?? '').toLowerCase();
  return code.replace(/^firestore\//, '').replace(/^auth\//, '');
}

export function classifyCloudError(error: unknown): CloudFailure {
  const code = normalizeErrorCode(error);
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  const searchable = `${code} ${message}`;

  if (searchable.includes('resource-exhausted') || searchable.includes('quota')) {
    return { kind: 'quota', code: code || 'resource-exhausted', retryable: true };
  }
  if (
    searchable.includes('unavailable') ||
    searchable.includes('deadline-exceeded') ||
    searchable.includes('network-request-failed') ||
    searchable.includes('network error') ||
    searchable.includes('offline')
  ) {
    return { kind: 'offline', code: code || 'unavailable', retryable: true };
  }
  if (searchable.includes('permission-denied') || searchable.includes('unauthenticated')) {
    return { kind: 'permission', code: code || 'permission-denied', retryable: false };
  }
  return { kind: 'unknown', code: code || 'unknown', retryable: true };
}
