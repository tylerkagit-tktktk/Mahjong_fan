import { TurboModuleRegistry } from 'react-native';
import { createSecureToken } from '../../../src/services/cloud/secureRandom';

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

function setCrypto(value: unknown): void {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  if (originalCryptoDescriptor) {
    Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
  } else {
    delete (globalThis as typeof globalThis & { crypto?: unknown }).crypto;
  }
});

describe('secure invite token', () => {
  it('uses native secure bytes and returns a 64-character hexadecimal token', () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({
      getRandomBase64: () => Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString('base64'),
    } as never);
    const mathRandom = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used for invite tokens');
    });

    const token = createSecureToken();

    expect(token).toBe('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('uses Web Crypto when the native module is unavailable', () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(null);
    setCrypto({
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });

    expect(createSecureToken()).toBe('ab'.repeat(32));
  });

  it('fails closed when no secure random source is available', () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(null);
    setCrypto(undefined);

    expect(() => createSecureToken()).toThrow('Secure random generator is unavailable');
  });
});
