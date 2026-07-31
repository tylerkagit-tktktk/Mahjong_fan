import { classifyCloudError } from '../../../src/services/cloud/cloudError';

describe('classifyCloudError', () => {
  it.each([
    ['firestore/resource-exhausted', 'quota'],
    ['firestore/unavailable', 'offline'],
    ['firestore/deadline-exceeded', 'offline'],
    ['firestore/permission-denied', 'permission'],
    ['auth/unauthenticated', 'permission'],
    ['firestore/internal', 'unknown'],
  ] as const)('classifies %s as %s', (code, kind) => {
    expect(classifyCloudError({ code })).toEqual(expect.objectContaining({ kind }));
  });

  it('recognizes quota errors from their message', () => {
    expect(classifyCloudError(new Error('Quota exceeded for this project')).kind).toBe('quota');
  });
});
