import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import Card from '../components/Card';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/RootNavigator';
import { listGames } from '../db/repo';
import { Game } from '../models/db';
import { useAppLanguage } from '../i18n/useAppLanguage';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

function HomeScreen({ navigation }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const { t } = useAppLanguage();

  const loadGames = useCallback(async () => {
    try {
      const data = await listGames();
      setGames(data);
    } catch (error) {
      console.error('[DB] Failed to load games', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadGames();
    }, [loadGames]),
  );

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.title}>{t('home.title')}</Text>
        <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
        <View style={styles.actions}>
          <PrimaryButton
            label={t('home.newGame')}
            onPress={() => navigation.navigate('NewGameStepper')}
          />
          <PrimaryButton
            label={t('home.settings')}
            onPress={() => navigation.navigate('Settings')}
            style={styles.secondaryButton}
          />
        </View>
      </Card>
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('home.history')}</Text>
        {games.length === 0 ? (
          <Text style={styles.emptyText}>{t('home.empty')}</Text>
        ) : (
          <View style={styles.historyList}>
            {games.map((game) => (
              <Pressable
                key={game.id}
                onPress={() => navigation.navigate('GameDashboard', { gameId: game.id })}
                style={({ pressed }) => [styles.historyItem, pressed && styles.pressed]}
              >
                <Text style={styles.historyTitle}>{game.title}</Text>
                <Text style={styles.historyDate}>
                  {new Date(game.createdAt).toLocaleDateString()}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  card: {
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  actions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  secondaryButton: {
    backgroundColor: theme.colors.primaryDark,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  emptyText: {
    color: theme.colors.textSecondary,
  },
  historyList: {
    gap: theme.spacing.sm,
  },
  historyItem: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    opacity: 0.8,
  },
  historyTitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  historyDate: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
});

export default HomeScreen;
