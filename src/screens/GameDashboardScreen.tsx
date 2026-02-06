import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import Card from '../components/Card';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { getGameBundle, getHandsCount } from '../db/repo';
import { GameBundle } from '../models/db';
import { parseRules, RulesV1, Variant } from '../models/rules';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { setBreadcrumb } from '../debug/breadcrumbs';
import { DEBUG_FLAGS } from '../debug/debugFlags';

type Props = NativeStackScreenProps<RootStackParamList, 'GameDashboard'>;

function GameDashboardScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { t } = useAppLanguage();
  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [handsCount, setHandsCount] = useState<number>(0);
  const [rules, setRules] = useState<RulesV1 | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBundle = useCallback(async () => {
    setError(null);
    setBreadcrumb('Dashboard: before getGameBundle', { gameId });
    const data = await getGameBundle(gameId);
    setBreadcrumb('Dashboard: after getGameBundle', { gameId });

    setBreadcrumb('Dashboard: before getHandsCount', { gameId });
    const count = await getHandsCount(gameId);
    setBreadcrumb('Dashboard: after getHandsCount', { gameId, count });

    setBreadcrumb('Dashboard: before parseRules', { gameId });
    const parsedRules = parseRules(data.game.rulesJson, normalizeVariant(data.game.variant));
    setBreadcrumb('Dashboard: after parseRules', { gameId, variant: parsedRules.variant });

    setBundle(data);
    setHandsCount(count);
    setRules(parsedRules);
    setBreadcrumb('Dashboard: after setState', { gameId });
  }, [gameId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setBreadcrumb('Dashboard: focus effect start', { gameId });

      (async () => {
        try {
          await loadBundle();
          if (cancelled) {
            setBreadcrumb('Dashboard: focus effect end (cancelled)', { gameId });
            return;
          }
          setBreadcrumb('Dashboard: focus effect end (ok)', { gameId });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err ?? 'unknown error');
          console.error('[Dashboard] loadBundle failed', err);
          if (cancelled) {
            setBreadcrumb('Dashboard: focus effect end (cancelled error)', { gameId, message });
            return;
          }
          setError(message || t('errors.loadGame'));
          setBreadcrumb('Dashboard: focus effect end (error)', { gameId, message });
        }
      })();

      return () => {
        cancelled = true;
        setBreadcrumb('Dashboard: focus effect cleanup', { gameId });
      };
    }, [gameId, loadBundle, t]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('dashboard.title')}</Text>
        <Text style={styles.subtitle}>
          {t('dashboard.gameId')} {gameId}
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {bundle ? (
          <>
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{bundle.game.title}</Text>
              <Text style={styles.metaText}>
                {t('dashboard.createdAt')} {new Date(bundle.game.createdAt).toLocaleDateString()}
              </Text>
              <Text style={styles.metaText}>
                {t('dashboard.variant')}{' '}
                {bundle.game.variant === 'HK' ? t('newGame.variant.hk') : t('newGame.variant.twSimple')}
              </Text>
              {rules?.mode !== 'PMA' ? (
                <Text style={styles.metaText}>
                  {t('dashboard.minFanToWin')} {rules?.minFanToWin ?? '-'}
                </Text>
              ) : null}
              <Text style={styles.metaText}>
                {t('dashboard.handsCount')} {handsCount}
              </Text>
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{t('dashboard.players')}</Text>
              {bundle.players
                .slice()
                .sort((a, b) => a.seatIndex - b.seatIndex)
                .map((player) => (
                  <Text key={player.id} style={styles.playerText}>
                    {player.name}
                  </Text>
                ))}
            </Card>
          </>
        ) : null}

        <View style={styles.actions}>
          <AppButton
            label={t('dashboard.addHand')}
            onPress={() => navigation.navigate('AddHand', { gameId })}
          />
          <AppButton
            label={t('common.back')}
            onPress={() => navigation.goBack()}
            variant="secondary"
            style={styles.secondaryAction}
          />
        </View>

        {DEBUG_FLAGS.enableScrollSpacer ? <View style={styles.debugSpacer} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function normalizeVariant(value: string): Variant {
  if (value === 'HK' || value === 'TW' || value === 'PMA') {
    return value;
  }
  if (value === 'TW_SIMPLE') {
    return 'TW';
  }
  return 'HK';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    flexGrow: 1,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.md,
  },
  card: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  metaText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  playerText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  actions: {
    marginTop: theme.spacing.md,
  },
  secondaryAction: {
    marginTop: theme.spacing.md,
  },
  debugSpacer: {
    height: 800,
  },
});

export default GameDashboardScreen;
