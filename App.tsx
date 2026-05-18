import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Alert, StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { initializeI18n, t } from './src/i18n/i18n';
import { dumpBreadcrumbs, getLastBreadcrumb, getLastSqlBreadcrumb } from './src/debug/breadcrumbs';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import { isDev } from './src/debug/isDev';

type GlobalScope = typeof globalThis & {
  addEventListener?: (type: string, handler: (event: unknown) => void) => void;
  removeEventListener?: (type: string, handler: (event: unknown) => void) => void;
  onunhandledrejection?: (event: unknown) => void;
  onerror?: (event: unknown) => void;
  HermesInternal?: {
    enablePromiseRejectionTracker?: (options: {
      allRejections?: boolean;
      onUnhandled?: (id: number, rejection: unknown) => void;
      onHandled?: (id: number) => void;
    }) => void;
    defaultPromiseRejectionTrackingOptions?: {
      onUnhandled?: (id: number, rejection: unknown) => void;
      onHandled?: (id: number) => void;
    };
  };
};

const globalScope = globalThis as GlobalScope;

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [navigationKey, setNavigationKey] = useState(0);
  const crashAlertShownRef = useRef(false);

  useEffect(() => {
    initializeI18n().catch((error) => {
      console.warn('[i18n] initialize failed', error);
    });
  }, []);

  useEffect(() => {
    const handleAsyncError = (origin: string, reason: unknown) => {
      const payload =
        reason instanceof Error
          ? { message: reason.message, stack: reason.stack, name: reason.name }
          : { message: String(reason ?? 'unknown') };
      console.error('[AppAsyncGuard]', { origin, ...payload });
      if (crashAlertShownRef.current) {
        return;
      }
      crashAlertShownRef.current = true;
      Alert.alert(
        t('app.errorBoundary.title'),
        t('app.errorBoundary.message'),
        [
          {
            text: t('app.errorBoundary.backHome'),
            onPress: () => {
              crashAlertShownRef.current = false;
              setNavigationKey((prev) => prev + 1);
            },
          },
        ],
      );
    };

    const onUnhandledRejection = (eventOrReason: unknown) => {
      const reason =
        typeof eventOrReason === 'object' && eventOrReason !== null && 'reason' in (eventOrReason as Record<string, unknown>)
          ? (eventOrReason as Record<string, unknown>).reason
          : eventOrReason;
      handleAsyncError('unhandledrejection', reason);
    };

    const onError = (eventOrMessage: unknown) => {
      const message =
        typeof eventOrMessage === 'object' && eventOrMessage !== null && 'message' in (eventOrMessage as Record<string, unknown>)
          ? (eventOrMessage as Record<string, unknown>).message
          : eventOrMessage;
      handleAsyncError('onerror', message);
    };

    globalScope.onunhandledrejection = onUnhandledRejection;

    if (typeof globalScope.addEventListener === 'function') {
      globalScope.addEventListener('unhandledrejection', onUnhandledRejection);
    }

    globalScope.onerror = onError;

    return () => {
      if (typeof globalScope.removeEventListener === 'function') {
        globalScope.removeEventListener('unhandledrejection', onUnhandledRejection);
      }
      globalScope.onunhandledrejection = undefined;
      globalScope.onerror = undefined;
    };
  }, []);

  useEffect(() => {
    if (!isDev) {
      return;
    }

    const pendingUnhandled = new Map<number, ReturnType<typeof setTimeout>>();
    const UNHANDLED_FLUSH_MS = 300;

    try {
      const HermesInternal = globalScope.HermesInternal;
      if (HermesInternal?.enablePromiseRejectionTracker) {
        HermesInternal.enablePromiseRejectionTracker({
          allRejections: true,
          onUnhandled(id: number, rejection: unknown) {
            try {
              const defaultHandler = globalScope.HermesInternal?.defaultPromiseRejectionTrackingOptions?.onUnhandled;
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
              const defaultHandled = globalScope.HermesInternal?.defaultPromiseRejectionTrackingOptions?.onHandled;
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
      if (typeof globalScope.addEventListener === 'function') {
        globalScope.addEventListener('unhandledrejection', handler);
      }
    } catch (err) {
      console.warn('[UnhandledPromiseRejection] addEventListener failed', err);
    }

    globalScope.onunhandledrejection = handler;
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AppErrorBoundary
          onBackHome={() => {
            setNavigationKey((prev) => prev + 1);
          }}
        >
          <NavigationContainer key={navigationKey}>
            <RootNavigator />
          </NavigationContainer>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
