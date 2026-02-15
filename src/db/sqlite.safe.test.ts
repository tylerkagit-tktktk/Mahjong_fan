import { normalizeError, safeDbCall } from './sqlite';

describe('sqlite safe helpers', () => {
  it('normalizeError wraps existing Error with friendly message', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('boom');
    const wrapped = normalizeError(error, 'ctx');
    expect(wrapped.message).toBe('Unable to access local data. Please try again.');
    warnSpy.mockRestore();
  });

  it('normalizeError wraps non-error values with friendly message', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapped = normalizeError('bad', 'ctx');
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toBe('Unable to access local data. Please try again.');
    warnSpy.mockRestore();
  });

  it('safeDbCall rethrows normalized errors', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      safeDbCall('ctx', async () => {
        throw 'oops';
      }),
    ).rejects.toThrow('Unable to access local data. Please try again.');
    warnSpy.mockRestore();
  });
});
