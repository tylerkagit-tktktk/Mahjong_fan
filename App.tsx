import { NavigationContainer } from '@react-navigation/native';
import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { initializeI18n } from './src/i18n/i18n';
import { dumpBreadcrumbs, getLastBreadcrumb, getLastSqlBreadcrumb } from './src/debug/breadcrumbs';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    void initializeI18n();
  }, []);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const pendingUnhandled = new Map<number, ReturnType<typeof setTimeout>>();
    const UNHANDLED_FLUSH_MS = 300;

    try {
      const HermesInternal = (global as any).HermesInternal;
      if (HermesInternal?.enablePromiseRejectionTracker) {
        HermesInternal.enablePromiseRejectionTracker({
          allRejections: true,
          onUnhandled(id: number, rejection: unknown) {
            try {
              const defaultHandler =
                (global as any).HermesInternal?.defaultPromiseRejectionTrackingOptions?.onUnhandled;
              if (typeof defaultHandler === 'function') {
                defaultHandler(id, rejection);
              }
            } catch (err) {
              console.warn('[UnhandledPromiseRejection] default handler failed', err);
            }
            const timer = setTimeout(() => {
              pendingUnhandled.delete(id);
              console.error(
                '[UnhandledPromiseRejection]',
                'id=',
                id,
                'type=',
                typeof rejection,
                'rejection=',
                rejection,
              );
              if (!rejection) {
                console.error(
                  '[BUG] falsy rejection (unhandled)',
                  new Error('[BUG] falsy rejection (unhandled)').stack,
                );
              }
              console.error(
                '[UnhandledPromiseRejection] breadcrumbs json=',
                JSON.stringify(dumpBreadcrumbs(20), null, 2),
              );
              console.error(
                '[UnhandledPromiseRejection] lastSQL json=',
                JSON.stringify(getLastSqlBreadcrumb(), null, 2),
              );
              console.error('[UnhandledPromiseRejection] last breadcrumb', getLastBreadcrumb());
            }, UNHANDLED_FLUSH_MS);
            pendingUnhandled.set(id, timer);
          },
          onHandled(id: number) {
            try {
              const defaultHandled =
                (global as any).HermesInternal?.defaultPromiseRejectionTrackingOptions?.onHandled;
              if (typeof defaultHandled === 'function') {
                defaultHandled(id);
              }
            } catch (err) {
              console.warn('[UnhandledPromiseRejection] default handled failed', err);
            }
            const pending = pendingUnhandled.get(id);
            if (pending) {
              clearTimeout(pending);
              pendingUnhandled.delete(id);
            }
            console.warn('[UnhandledPromiseRejection handled]', 'id=', id);
          },
        });
      }
    } catch (error) {
      console.warn('[UnhandledPromiseRejection] Hermes tracker failed', error);
    }

    const handler = (eventOrReason: any, promise?: any) => {
      const reason = eventOrReason?.reason ?? eventOrReason;
      const stack = reason?.stack ?? eventOrReason?.stack;
      console.error('[UnhandledPromiseRejection]', {
        reason,
        stack,
        promise,
      });
    };

    try {
      if (typeof (globalThis as any)?.addEventListener === 'function') {
        (globalThis as any).addEventListener('unhandledrejection', handler);
      }
    } catch (err) {
      console.warn('[UnhandledPromiseRejection] addEventListener failed', err);
    }

    (globalThis as any).onunhandledrejection = handler;
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
