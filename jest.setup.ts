import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-qrcode-svg', () => {
  const ReactLib = require('react');
  return function MockQRCode(props: Record<string, unknown>) {
    return ReactLib.createElement('QRCode', props);
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
