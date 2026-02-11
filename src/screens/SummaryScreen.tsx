import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { getGameBundle } from '../db/repo';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

function SummaryScreen({ navigation, route }: Props) {
  const { t } = useAppLanguage();
  const { gameId } = route.params;
  const [title, setTitle] = useState<string>('');
  const [endedAt, setEndedAt] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const bundle = await getGameBundle(gameId);
          if (cancelled) {
            return;
          }
          setTitle(bundle.game.title || t('summary.title'));
          setEndedAt(bundle.game.endedAt ?? null);
        } catch {
          if (!cancelled) {
            setTitle(t('summary.title'));
            setEndedAt(null);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [gameId, t]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Text style={styles.title}>{title || t('summary.title')}</Text>
      <Text style={styles.subtitle}>{endedAt ? '牌局已結束' : '牌局摘要'}</Text>
      <AppButton label={t('common.back')} onPress={() => navigation.replace('Tabs')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
});

export default SummaryScreen;
