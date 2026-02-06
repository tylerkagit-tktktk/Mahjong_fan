import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import Card from '../components/Card';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { createGameWithPlayers, listGames, wipeAllData } from '../db/repo';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { getDefaultRules, serializeRules } from '../models/rules';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

function SettingsScreen({ navigation }: Props) {
  const { t, setLanguage } = useAppLanguage();

  const handleCreateSample = async () => {
    try {
      const gameId = makeId('game');
      const rules = getDefaultRules('HK');
      await createGameWithPlayers(
        {
          id: gameId,
          title: t('home.sampleGame'),
          createdAt: Date.now(),
          currencySymbol: rules.currencySymbol,
          variant: rules.variant,
          rulesJson: serializeRules(rules),
          languageOverride: null,
        },
        [
          { id: makeId('player'), gameId, name: 'East', seatIndex: 0 },
          { id: makeId('player'), gameId, name: 'South', seatIndex: 1 },
          { id: makeId('player'), gameId, name: 'West', seatIndex: 2 },
          { id: makeId('player'), gameId, name: 'North', seatIndex: 3 },
        ],
      );
      console.log('[DB] Sample game created', { gameId });
    } catch (error) {
      console.error('[DB] Create sample game failed', error);
    }
  };

  const handleListGames = async () => {
    try {
      const games = await listGames();
      console.log('[DB] Games', games);
    } catch (error) {
      console.error('[DB] List games failed', error);
    }
  };

  const handleWipeAll = async () => {
    try {
      await wipeAllData();
      console.log('[DB] Wiped all data');
    } catch (error) {
      console.error('[DB] Wipe all failed', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('settings.title')}</Text>
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('settings.dbDebug')}</Text>
        <PrimaryButton label={t('settings.createSample')} onPress={() => void handleCreateSample()} />
        <PrimaryButton label={t('settings.listGames')} onPress={() => void handleListGames()} />
        <PrimaryButton label={t('settings.wipeAll')} onPress={() => void handleWipeAll()} />
      </Card>
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <PrimaryButton label={t('language.zhHant')} onPress={() => void setLanguage('zh-Hant')} />
        <PrimaryButton label={t('language.zhHans')} onPress={() => void setLanguage('zh-Hans')} />
        <PrimaryButton label={t('language.en')} onPress={() => void setLanguage('en')} />
      </Card>
      <PrimaryButton label={t('common.back')} onPress={() => navigation.goBack()} />
    </View>
  );
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  card: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
});

export default SettingsScreen;
