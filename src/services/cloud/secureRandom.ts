import { TurboModuleRegistry, type TurboModule } from 'react-native';
import base64Decode from 'fast-base64-decode';

interface NativeSecureRandomModule extends TurboModule {
  getRandomBase64(byteLength: number): string;
}

type CryptoSource = {
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

function fillFromNative(bytes: Uint8Array): boolean {
  const nativeModule = TurboModuleRegistry.get<NativeSecureRandomModule>('RNGetRandomValues');
  if (!nativeModule) {
    return false;
  }

  const encoded = nativeModule.getRandomBase64(bytes.byteLength);
  base64Decode(encoded, bytes);
  return true;
}

function fillFromCrypto(bytes: Uint8Array): boolean {
  const cryptoSource = (globalThis as typeof globalThis & { crypto?: CryptoSource }).crypto;
  if (typeof cryptoSource?.getRandomValues !== 'function') {
    return false;
  }

  cryptoSource.getRandomValues(bytes);
  return true;
}

export function createSecureToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);

  try {
    if (fillFromNative(bytes)) {
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Remote debugging cannot call synchronous native modules; Web Crypto remains safe.
  }

  if (fillFromCrypto(bytes)) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Secure random generator is unavailable');
}
