import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import { listGames } from '../db/repo';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { Game } from '../models/db';
import { RootStackParamList, RootTabParamList } from '../navigation/types';
import theme from '../theme/theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<RootTabParamList, 'History'>,
  NativeStackScreenProps<RootStackParamList>
>;

function HistoryScreen({ navigation }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const { t } = useAppLanguage();

  const loadGames = useCallback(async () => {
    try {
      const data = await listGames();
      setGames(data);
    } catch (error) {
      console.error('[DB] Failed to load all games', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadGames().catch((error) => {
        console.error('[DB] Failed to refresh all games', error);
      });
    }, [loadGames]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('home.historyAll')}</Text>
          {games.length === 0 ? (
            <Text style={styles.emptyText}>{t('home.empty')}</Text>
          ) : (
            <View style={styles.historyList}>
              {games.map((game, index) => (
                <Pressable
                  key={game.id}
                  onPress={() => navigation.navigate('GameDashboard', { gameId: game.id })}
                  style={({ pressed }) => [
                    styles.historyItem,
                    index < games.length - 1 && styles.historyItemSpacing,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.historyTitle}>{game.title}</Text>
                  <Text style={styles.historyDate}>{new Date(game.createdAt).toLocaleDateString()}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
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
    paddingBottom: theme.spacing.xl,
  },
  card: {
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  historyList: {
    marginTop: theme.spacing.sm,
  },
  historyItem: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  historyItemSpacing: {
    marginBottom: theme.spacing.sm,
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

export default HistoryScreen;
