import renderer, { act } from 'react-test-renderer';
import type { ReactNode } from 'react';
import App from '../App';
import { initializeI18n } from '../src/i18n/i18n';
import { initializeAppPreferences } from '../src/settings/appPreferences';

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children?: ReactNode }) => children,
}));

jest.mock('react-native-gesture-handler', () => {
  const ReactLib = require('react');
  return {
    GestureHandlerRootView: ({ children }: { children?: ReactNode }) =>
      ReactLib.createElement(ReactLib.Fragment, null, children),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children?: ReactNode }) => children,
}));

jest.mock('../src/navigation/RootNavigator', () => () => null);
jest.mock('../src/components/AppErrorBoundary', () => ({ children }: { children?: ReactNode }) => children);
jest.mock('../src/navigation/linking', () => ({ linking: {} }));
jest.mock('../src/i18n/i18n', () => ({
  initializeI18n: jest.fn(() => Promise.resolve()),
  t: (key: string) => key,
}));
jest.mock('../src/settings/appPreferences', () => ({
  initializeAppPreferences: jest.fn(() => Promise.resolve()),
}));

describe('App shell', () => {
  it('renders the provider shell and initializes app services', async () => {
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<App />);
      await Promise.resolve();
    });

    expect(tree!.root).toBeDefined();
    expect(initializeI18n).toHaveBeenCalledTimes(1);
    expect(initializeAppPreferences).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.unmount();
    });
  });
});
