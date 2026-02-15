import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { listGames } from '../db/repo';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { Game } from '../models/db';
import { INITIAL_ROUND_LABEL_ZH } from '../constants/game';
import { RootStackParamList } from '../navigation/types';
import theme from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

type FilterKey = 'all' | '7d' | '30d';

type GameSummary = {
  playersCount: number;
  durationLabel: string;
  winnerText: string;
  loserText: string;
  hasResult: boolean;
};

type FlatRow =
  | {
      type: 'header';
      id: string;
      label: string;
    }
  | {
      type: 'game';
      id: string;
      game: Game;
    };

const ITEM_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

const FILTER_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.03,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

function translateWithFallback(
  t: (key: TranslationKey) => string,
  key: string,
  fallback: string,
  replacements?: Record<string, string | number>,
): string {
  const raw = t(key as TranslationKey);
  const base = raw === key ? fallback : raw;
  if (!replacements) {
    return base;
  }
  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value)),
    base,
  );
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  const hh = `${date.getHours()}`.padStart(2, '0');
  const min = `${date.getMinutes()}`.padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

function formatDuration(
  createdAt: number,
  endedAt: number | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  const endAt = endedAt ?? Date.now();
  const diff = Math.max(0, endAt - createdAt);
  const minutes = Math.max(1, Math.floor(diff / 60000));

  if (minutes < 60) {
    return translateWithFallback(t, 'gameTable.elapsed.minutes', `已玩 ${minutes} 分鐘`, { minutes });
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return translateWithFallback(t, 'gameTable.elapsed.hoursMinutes', `已玩 ${hours} 小時 ${rest} 分鐘`, {
    hours,
    minutes: rest,
  });
}

function buildSummaryFromSnapshot(game: Game, t: (key: TranslationKey) => string): GameSummary {
  const base: GameSummary = {
    playersCount: 0,
    durationLabel: formatDuration(game.createdAt, game.endedAt, t),
    winnerText: '—',
    loserText: '—',
    hasResult: false,
  };
  if (!game.resultSummaryJson) {
    return base;
  }

  try {
    const parsed = JSON.parse(game.resultSummaryJson) as {
      winnerText?: string;
      loserText?: string;
      playersCount?: number;
    };
    return {
      playersCount: parsed.playersCount ?? 0,
      durationLabel: base.durationLabel,
      winnerText: parsed.winnerText ?? '—',
      loserText: parsed.loserText ?? '—',
      hasResult: Boolean(parsed.winnerText || parsed.loserText),
    };
  } catch {
    return base;
  }
}

function getDateGroupLabel(createdAt: number, now: number, t: (key: TranslationKey) => string): string {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (createdAt >= todayStart.getTime()) {
    return translateWithFallback(t, 'history.group.today', '今日');
  }

  if (createdAt >= yesterdayStart.getTime()) {
    return translateWithFallback(t, 'history.group.yesterday', '昨日');
  }

  return formatDate(createdAt);
}

function inRange(createdAt: number, now: number, filter: FilterKey): boolean {
  if (filter === 'all') {
    return true;
  }

  const days = filter === '7d' ? 7 : 30;
  const threshold = now - days * 24 * 60 * 60 * 1000;
  return createdAt >= threshold;
}

function HistoryScreen({ navigation }: Props) {
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [games, setGames] = useState<Game[]>([]);
  const [summaries, setSummaries] = useState<Record<string, GameSummary>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const hasLoadedOnceRef = useRef(false);

  const renderHeaderLeft = useCallback(
    () => (
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={10}
        style={({ pressed }) => [styles.headerIconHitArea, pressed && styles.headerIconPressed]}
      >
        <Text style={styles.headerBackIcon}>‹</Text>
      </Pressable>
    ),
    [navigation],
  );

  const renderHeaderRight = useCallback(
    () => (
      <Pressable
        onPress={() => navigation.navigate('Settings')}
        hitSlop={10}
        style={({ pressed }) => [styles.headerIconHitArea, pressed && styles.headerIconPressed]}
      >
        <Text style={styles.headerGearIcon}>⚙︎</Text>
      </Pressable>
    ),
    [navigation],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackVisible: false,
      headerTransparent: false,
      headerShadowVisible: false,
      headerStyle: {
        backgroundColor: theme.colors.background,
        borderBottomWidth: 0,
        shadowOpacity: 0,
        elevation: 0,
      },
      headerLeftContainerStyle: {
        backgroundColor: 'transparent',
      },
      headerRightContainerStyle: {
        backgroundColor: 'transparent',
      },
      headerLeft: renderHeaderLeft,
      headerRight: renderHeaderRight,
    });
  }, [navigation, renderHeaderLeft, renderHeaderRight]);

  const loadData = useCallback(async () => {
    const shouldShowSkeleton = !hasLoadedOnceRef.current;
    if (shouldShowSkeleton) {
      setLoading(true);
    }
    try {
      const gameList = await listGames();
      setGames(gameList);
      const nextSummaries = Object.fromEntries(gameList.map((game) => [game.id, buildSummaryFromSnapshot(game, t)]));
      setSummaries(nextSummaries);

      hasLoadedOnceRef.current = true;
    } catch (error) {
      console.error('[DB] Failed to load history data', error);
      setGames([]);
      setSummaries({});
      hasLoadedOnceRef.current = true;
    } finally {
      if (shouldShowSkeleton) {
        setLoading(false);
      }
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!active) return;
        await loadData();
      })().catch((error) => {
        console.error('[DB] Failed to refresh history data', error);
      });

      return () => {
        active = false;
      };
    }, [loadData]),
  );

  const filteredGames = useMemo(() => {
    const now = Date.now();
    return games.filter((game) => inRange(game.createdAt, now, filter));
  }, [games, filter]);

  const rows = useMemo<FlatRow[]>(() => {
    const now = Date.now();
    const grouped = new Map<string, Game[]>();
    const activeGames: Game[] = [];

    filteredGames.forEach((game) => {
      if (game.endedAt == null) {
        activeGames.push(game);
        return;
      }
      const label = getDateGroupLabel(game.createdAt, now, t);
      const list = grouped.get(label) ?? [];
      list.push(game);
      grouped.set(label, list);
    });

    const output: FlatRow[] = [];
    if (activeGames.length > 0) {
      output.push({
        type: 'header',
        id: 'header:active',
        label: translateWithFallback(t, 'history.group.active', '進行中'),
      });
      activeGames.forEach((game) => {
        output.push({ type: 'game', id: `game:${game.id}`, game });
      });
    }
    grouped.forEach((groupGames, label) => {
      output.push({ type: 'header', id: `header:${label}`, label });
      groupGames.forEach((game) => {
        output.push({ type: 'game', id: `game:${game.id}`, game });
      });
    });

    return output;
  }, [filteredGames, t]);

  const filterOptions: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: translateWithFallback(t, 'history.filter.all', '全部') },
    { key: '7d', label: translateWithFallback(t, 'history.filter.7d', '7日') },
    { key: '30d', label: translateWithFallback(t, 'history.filter.30d', '30日') },
  ];
  const filterLabel = filter === '7d'
    ? translateWithFallback(t, 'history.filter.7d', '7日')
    : filter === '30d'
      ? translateWithFallback(t, 'history.filter.30d', '30日')
      : translateWithFallback(t, 'history.filter.all', '全部');

  const summaryStats = useMemo(() => {
    const totalMatches = filteredGames.length;
    let endedMatches = 0;

    filteredGames.forEach((game) => {
      if (game.endedAt != null) {
        endedMatches += 1;
      }
    });

    return {
      totalMatches,
      endedMatches,
    };
  }, [filteredGames]);

  const renderItem = ({ item }: { item: FlatRow }) => {
    if (item.type === 'header') {
      return <Text style={styles.groupHeader}>{item.label}</Text>;
    }

    const game = item.game;
    const summary = summaries[game.id];
    const isInProgress = game.endedAt == null;
    const isAbandoned = game.endedAt != null && ((game.handsCount ?? 0) === 0 || game.resultStatus === 'abandoned');
    const statusLabel = isInProgress
      ? translateWithFallback(t, 'history.status.active', '進行中')
      : isAbandoned
        ? translateWithFallback(t, 'history.status.abandoned', '已放棄')
        : translateWithFallback(t, 'history.status.ended', '已結束');

    const playerCount = summary && summary.playersCount > 0 ? summary.playersCount : 4;
    const playersLabel = translateWithFallback(t, 'history.meta.players', `${playerCount} 人`, { count: playerCount });

    const metaLine = [summary ? summary.durationLabel : '—', playersLabel].join(' · ');

    const hasResult = Boolean(summary && summary.hasResult);
    const canOpenDetail = game.endedAt != null && !isAbandoned;
    const defaultRoundLabel = translateWithFallback(t, 'history.round.initial', INITIAL_ROUND_LABEL_ZH);
    const activeRoundLabel = game.currentRoundLabelZh || defaultRoundLabel;
    const settlementLine = isInProgress
      ? activeRoundLabel
      : hasResult
        ? `${summary?.winnerText ?? '—'}  ｜  ${summary?.loserText ?? '—'}`
      : game.resultStatus === 'abandoned' || (game.handsCount ?? 0) === 0
          ? translateWithFallback(t, 'history.status.abandoned', '已放棄')
          : game.gameState === 'draft'
            ? defaultRoundLabel
            : translateWithFallback(t, 'history.result.calculating', '結果計算中…');

    return (
      <Pressable
        onPress={() => {
          if (!canOpenDetail) return;
          navigation.navigate('GameDashboard', { gameId: game.id });
        }}
        style={({ pressed }) => [
          styles.itemCard,
          !canOpenDetail && styles.itemDisabled,
          canOpenDetail && pressed && styles.itemPressed,
        ]}
      >
        <View style={styles.itemHeaderRow}>
          <Text style={styles.itemTitle} numberOfLines={1} ellipsizeMode="tail">
            {game.title}
          </Text>
          <Text style={styles.itemDateText}>{formatDateTime(game.createdAt)}</Text>
        </View>
        <View style={styles.itemMetaRow}>
          <Text style={styles.itemMeta}>{metaLine}</Text>
          <View style={styles.rightMetaWrap}>
            <View
              style={[
                styles.itemStatusPill,
                isInProgress ? styles.itemStatusActive : isAbandoned ? styles.itemStatusAbandoned : styles.itemStatusEnded,
              ]}
            >
              <Text style={styles.itemStatusText}>{statusLabel}</Text>
            </View>
            {canOpenDetail ? <Text style={styles.chevron}>›</Text> : null}
          </View>
        </View>
        <Text style={hasResult ? styles.itemSummary : styles.itemSummaryMuted}>{settlementLine}</Text>
      </Pressable>
    );
  };

  const renderLoading = () => (
    <View style={styles.loadingList}>
      {Array.from({ length: 4 }).map((_, idx) => (
        <View key={`skeleton-${idx}`} style={styles.skeletonCard} />
      ))}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{translateWithFallback(t, 'history.empty.title', '未有對局記錄')}</Text>
      <Text style={styles.emptySubtitle}>{translateWithFallback(t, 'history.empty.subtitle', '按「新開局」開始第一局')}</Text>
      <Pressable style={styles.emptyAction} onPress={() => navigation.navigate('NewGameStepper')}>
        <Text style={styles.emptyActionText}>{translateWithFallback(t, 'history.empty.actionStart', '開始新對局')}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.headerArea}>
        <View style={styles.filterWrap}>
          {filterOptions.map((option) => {
            const selected = filter === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setFilter(option.key)}
                style={[styles.filterPill, selected && styles.filterPillActive]}
              >
                <Text style={[styles.filterText, selected && styles.filterTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.summaryBar}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryKicker}>
              {`${filterLabel}${translateWithFallback(t, 'history.summary.matches', '場數')}`}
            </Text>
            <Text style={styles.summaryValue}>{summaryStats.totalMatches}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCell}>
            <Text style={styles.summaryKicker}>{translateWithFallback(t, 'history.summary.ended', '已結束')}</Text>
            <Text style={styles.summaryValue}>{summaryStats.endedMatches}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        renderLoading()
      ) : rows.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom > 0 ? insets.bottom : theme.spacing.sm }]}
          showsVerticalScrollIndicator={false}
          {...(Platform.OS === 'ios'
            ? {
                contentInsetAdjustmentBehavior: 'automatic' as const,
                scrollIndicatorInsets: { bottom: insets.bottom },
              }
            : {})}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerArea: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  headerIconHitArea: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  headerIconPressed: {
    opacity: 0.45,
  },
  headerBackIcon: {
    fontSize: 24,
    lineHeight: 26,
    color: theme.colors.textPrimary,
    fontWeight: '400',
  },
  headerGearIcon: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  filterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryBar: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,63,56,0.07)',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  summaryKicker: {
    fontSize: 11,
    lineHeight: 13,
    color: 'rgba(70,63,56,0.58)',
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(70,63,56,0.08)',
  },
  summaryValue: {
    marginTop: 4,
    fontSize: theme.fontSize.md,
    lineHeight: 22,
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  filterPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,63,56,0.09)',
    marginRight: theme.spacing.xs,
  },
  filterPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: 'rgba(53,92,86,0.22)',
    ...FILTER_SHADOW,
  },
  filterText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  filterTextActive: {
    color: theme.colors.surface,
  },
  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  groupHeader: {
    marginTop: theme.spacing.md,
    marginBottom: 6,
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  itemCard: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(70,63,56,0.08)',
    ...ITEM_SHADOW,
  },
  itemPressed: {
    opacity: 0.93,
  },
  itemDisabled: {
    opacity: 0.6,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginRight: theme.spacing.sm,
    lineHeight: 22,
  },
  itemDateText: {
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginLeft: theme.spacing.sm,
  },
  itemMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rightMetaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
    marginLeft: theme.spacing.sm,
  },
  itemStatusActive: {
    backgroundColor: 'rgba(53,92,86,0.10)',
  },
  itemStatusEnded: {
    backgroundColor: 'rgba(120,120,120,0.10)',
  },
  itemStatusAbandoned: {
    backgroundColor: 'rgba(120,120,120,0.16)',
  },
  itemStatusText: {
    fontSize: 10,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  chevron: {
    marginLeft: 7,
    fontSize: 15,
    lineHeight: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  itemMeta: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  itemSummary: {
    marginTop: 8,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    lineHeight: 19,
  },
  itemSummaryMuted: {
    marginTop: 8,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  loadingList: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  skeletonCard: {
    height: 88,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(0,0,0,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    marginBottom: theme.spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  emptyAction: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  emptyActionText: {
    color: theme.colors.surface,
    fontWeight: '600',
    fontSize: theme.fontSize.sm,
  },
});

export default HistoryScreen;
