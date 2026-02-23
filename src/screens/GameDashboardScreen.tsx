import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, SectionList, Share, StyleSheet, Text, View } from 'react-native';
import AppButton from '../components/AppButton';
import Card from '../components/Card';
import ScreenContainer from '../components/ScreenContainer';
import { getGameBundle } from '../db/repo';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { GameBundle, Hand } from '../models/db';
import { getRoundLabel } from '../models/dealer';
import { computeGameStats } from '../models/gameStats';
import { parseRules, RulesV1, Variant } from '../models/rules';
import { RootStackParamList } from '../navigation/types';
import theme from '../theme/theme';
import { typography } from '../styles/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'GameDashboard'>;

type SeatSummary = {
  playerId: string;
  name: string;
  total: number;
};

type HandDisplay = {
  hand: Hand;
  index: number;
  roundLabel: string;
  windLabel: string;
};

type HandFilter = 'all' | 'wins' | 'draws';

type HandSection = {
  title: string;
  data: HandDisplay[];
  totalCount: number;
};

const SEAT_KEYS: Array<'seat.east' | 'seat.south' | 'seat.west' | 'seat.north'> = [
  'seat.east',
  'seat.south',
  'seat.west',
  'seat.north',
];

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

function normalizeVariant(value: string): Variant {
  if (value === 'HK' || value === 'TW' || value === 'PMA') {
    return value;
  }
  if (value === 'TW_SIMPLE') {
    return 'TW';
  }
  return 'HK';
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const dd = `${date.getDate()}`.padStart(2, '0');
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatSignedMoney(value: number, symbol: string): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  if (rounded === 0) {
    return '0';
  }
  return `${sign}${symbol ?? ''}${abs}`;
}

function getRankPrefix(index: number): string {
  if (index === 0) {
    return '🥇';
  }
  if (index === 1) {
    return '🥈';
  }
  if (index === 2) {
    return '🥉';
  }
  return `${index + 1}.`;
}

function formatHighlight(value: { name: string; count: number; tiedCount: number } | null, t: (key: TranslationKey) => string): string {
  if (!value) {
    return '—';
  }
  if (value.tiedCount > 1) {
    return `${value.name} (${value.count}) (+${value.tiedCount - 1} ${translateWithFallback(
      t,
      'game.detail.share.more',
      'more',
    )})`;
  }
  return `${value.name} (${value.count})`;
}

function buildShareRankingLines(
  rankedPlayers: SeatSummary[],
  symbol: string,
  t: (key: TranslationKey) => string,
): string[] {
  const tieCountByTotal = new Map<number, number>();
  rankedPlayers.forEach((player) => {
    tieCountByTotal.set(player.total, (tieCountByTotal.get(player.total) ?? 0) + 1);
  });

  const emittedTotals = new Set<number>();
  return rankedPlayers.map((player, index) => {
    const sameTotalCount = tieCountByTotal.get(player.total) ?? 1;
    const tieSuffix =
      sameTotalCount > 1 && !emittedTotals.has(player.total)
        ? ` ${translateWithFallback(t, 'game.detail.share.tieSuffix', '(+{count} more)', {
            count: sameTotalCount - 1,
          })}`
        : '';
    emittedTotals.add(player.total);
    return `${index + 1}. ${player.name} ${formatSignedMoney(player.total, symbol)}${tieSuffix}`;
  });
}

function resolveDeltasQ(deltasJson?: string | null): number[] | null {
  if (!deltasJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(deltasJson) as number[] | { values?: number[]; deltasQ?: number[] };
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.values)) {
      return parsed.values;
    }
    if (Array.isArray(parsed.deltasQ)) {
      return parsed.deltasQ;
    }
    return null;
  } catch {
    return null;
  }
}

function parseDealerAction(computedJson: string | null | undefined): 'stick' | 'pass' | null {
  if (!computedJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(computedJson) as { dealerAction?: unknown };
    if (parsed.dealerAction === 'stick' || parsed.dealerAction === 'pass') {
      return parsed.dealerAction;
    }
    return null;
  } catch {
    return null;
  }
}

function GameDashboardScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { t } = useAppLanguage();

  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [rules, setRules] = useState<RulesV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedHands, setExpandedHands] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [visibleHandsCount, setVisibleHandsCount] = useState(20);
  const [handFilter, setHandFilter] = useState<HandFilter>('all');

  const sectionListRef = useRef<SectionList<HandDisplay, HandSection>>(null);
  const nonEndedAlertShownRef = useRef(false);

  const loadBundle = useCallback(async () => {
    setError(null);
    const data = await getGameBundle(gameId);
    setBundle(data);
    setRules(parseRules(data.game.rulesJson, normalizeVariant(data.game.variant)));
    setCollapsedSections({});
    setVisibleHandsCount(20);
    setHandFilter('all');
    setLoading(false);
  }, [gameId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          await loadBundle();
        } catch (err) {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err ?? 'unknown error');
          setError(message || translateWithFallback(t, 'errors.loadGame', '載入對局失敗'));
          setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [loadBundle, t]),
  );

  const isEnded = bundle?.game.gameState === 'ended';

  useEffect(() => {
    if (!bundle || isEnded || nonEndedAlertShownRef.current) {
      return;
    }
    nonEndedAlertShownRef.current = true;
    Alert.alert(
      translateWithFallback(t, 'game.detail.readOnlyBlockedTitle', '只可查看已結束對局'),
      translateWithFallback(t, 'game.detail.readOnlyWarning', '此頁僅供已結束對局查看。'),
      [
        {
          text: translateWithFallback(t, 'common.ok', '確定'),
          onPress: () => navigation.goBack(),
        },
      ],
    );
  }, [bundle, isEnded, navigation, t]);

  const orderedHands = useMemo(() => {
    if (!bundle) {
      return [] as Hand[];
    }
    return bundle.hands.slice().sort((a, b) => a.handIndex - b.handIndex);
  }, [bundle]);

  const gameStats = useMemo(() => (bundle ? computeGameStats(bundle) : null), [bundle]);

  const rankedPlayers = useMemo(() => {
    if (!bundle || !gameStats) {
      return [] as SeatSummary[];
    }
    return gameStats.ranking.map((entry) => ({
      playerId: entry.playerId,
      name: entry.name,
      total: entry.totalMoney,
    }));
  }, [bundle, gameStats]);

  const handDisplayList = useMemo(() => {
    if (!bundle) {
      return [] as HandDisplay[];
    }
    const progressiveHands: Hand[] = [];
    return orderedHands.map((hand, index) => {
      progressiveHands.push(hand);
      const roundLabel = getRoundLabel(bundle.game.startingDealerSeatIndex, progressiveHands).labelZh;
      return { hand, index, roundLabel, windLabel: roundLabel.slice(0, 2) };
    });
  }, [bundle, orderedHands]);

  const filteredHandDisplayList = useMemo(() => {
    if (handFilter === 'wins') {
      return handDisplayList.filter((entry) => !entry.hand.isDraw);
    }
    if (handFilter === 'draws') {
      return handDisplayList.filter((entry) => entry.hand.isDraw);
    }
    return handDisplayList;
  }, [handDisplayList, handFilter]);

  const visibleHandDisplayList = useMemo(() => {
    if (visibleHandsCount >= filteredHandDisplayList.length) {
      return filteredHandDisplayList;
    }
    return filteredHandDisplayList.slice(filteredHandDisplayList.length - visibleHandsCount);
  }, [filteredHandDisplayList, visibleHandsCount]);

  const totalCountByWind = useMemo(() => {
    const counts = new Map<string, number>();
    filteredHandDisplayList.forEach((entry) => {
      counts.set(entry.windLabel, (counts.get(entry.windLabel) ?? 0) + 1);
    });
    return counts;
  }, [filteredHandDisplayList]);

  const handSections = useMemo(() => {
    const sections = new Map<string, HandDisplay[]>();
    visibleHandDisplayList.forEach((entry) => {
      const list = sections.get(entry.windLabel) ?? [];
      list.push(entry);
      sections.set(entry.windLabel, list);
    });
    return Array.from(sections.entries()).map(([title, data]) => ({
      title,
      data,
      totalCount: totalCountByWind.get(title) ?? data.length,
    }));
  }, [totalCountByWind, visibleHandDisplayList]);

  const handsCount = bundle?.game.handsCount ?? orderedHands.length;

  const localizedScoringPreset = useMemo(() => {
    const preset = rules?.hk?.scoringPreset;
    if (!preset) {
      return '—';
    }
    if (preset === 'traditionalFan') {
      return translateWithFallback(t, 'game.detail.rules.hkPreset.traditionalFan', '傳統番數');
    }
    if (preset === 'customTable') {
      return translateWithFallback(t, 'game.detail.rules.hkPreset.customTable', '自訂表');
    }
    return '—';
  }, [rules?.hk?.scoringPreset, t]);

  const localizedGunMode = useMemo(() => {
    const mode = rules?.hk?.gunMode;
    if (!mode) {
      return '—';
    }
    if (mode === 'fullGun') {
      return translateWithFallback(t, 'game.detail.rules.hkGunMode.fullGun', '全銃');
    }
    if (mode === 'halfGun') {
      return translateWithFallback(t, 'game.detail.rules.hkGunMode.halfGun', '半銃');
    }
    return '—';
  }, [rules?.hk?.gunMode, t]);

  const localizedStakePreset = useMemo(() => {
    const stakePreset = rules?.hk?.stakePreset;
    if (!stakePreset) {
      return '—';
    }
    if (stakePreset === 'TWO_FIVE_CHICKEN') {
      return translateWithFallback(t, 'game.detail.rules.hkStake.twoFiveChicken', '二五雞');
    }
    if (stakePreset === 'FIVE_ONE') {
      return translateWithFallback(t, 'game.detail.rules.hkStake.fiveOne', '五一');
    }
    if (stakePreset === 'ONE_TWO') {
      return translateWithFallback(t, 'game.detail.rules.hkStake.oneTwo', '一二蚊');
    }
    return '—';
  }, [rules?.hk?.stakePreset, t]);

  const localizedVariant = useMemo(() => {
    if (bundle?.game.variant === 'HK') {
      return translateWithFallback(t, 'newGame.variant.hk', '香港牌');
    }
    if (bundle?.game.variant === 'TW' || bundle?.game.variant === 'TW_SIMPLE') {
      return translateWithFallback(t, 'newGame.variant.twSimple', '台牌');
    }
    if (bundle?.game.variant === 'PMA') {
      return translateWithFallback(t, 'newGame.variant.pma', '跑馬仔');
    }
    return '—';
  }, [bundle?.game.variant, t]);

  const seatLabels = useMemo(
    () =>
      SEAT_KEYS.map((key, index) => ({
        seatIndex: index,
        label: translateWithFallback(t, key, ['東', '南', '西', '北'][index]),
      })),
    [t],
  );

  const jumpButtons = useMemo(
    () => [
      { wind: '東風', key: 'game.detail.hands.jump.east' },
      { wind: '南風', key: 'game.detail.hands.jump.south' },
      { wind: '西風', key: 'game.detail.hands.jump.west' },
      { wind: '北風', key: 'game.detail.hands.jump.north' },
    ],
    [],
  );

  const handleShare = useCallback(async () => {
    if (!bundle) {
      return;
    }
    if (!isEnded) {
      Alert.alert(
        translateWithFallback(t, 'game.detail.readOnlyBlockedTitle', '只可查看已結束對局'),
        translateWithFallback(t, 'game.detail.readOnlyWarning', '此頁僅供已結束對局查看。'),
      );
      return;
    }
    const rankingLines = buildShareRankingLines(rankedPlayers, bundle.game.currencySymbol ?? '', t);
    const playerStatsLines = rankedPlayers.map(
      (player) =>
        `${player.name}：${translateWithFallback(t, 'game.detail.stats.wins', '胡牌')} ${
          gameStats?.winsByPlayerId[player.playerId] ?? 0
        }｜${translateWithFallback(t, 'game.detail.stats.zimo', '自摸')} ${gameStats?.zimoByPlayerId[player.playerId] ?? 0}`,
    );
    const titleText = bundle.game.title || translateWithFallback(t, 'game.detail.header.title', '對局總結');
    const dateText = formatDate(bundle.game.createdAt);
    const summaryText = [
      `${titleText} — ${dateText}`,
      '',
      `${translateWithFallback(t, 'game.detail.players.title', '玩家排名')}:`,
      ...rankingLines,
      '',
      `${translateWithFallback(t, 'game.detail.stats.title', '統計')}:`,
      `${translateWithFallback(t, 'game.detail.header.handsPlayed', '已打 {count} 鋪', { count: handsCount })}`,
      `${translateWithFallback(t, 'game.detail.stats.draws', '流局')}: ${gameStats?.draws ?? 0}`,
      ...playerStatsLines,
      `${translateWithFallback(t, 'game.detail.stats.mostDiscard', '最多出銃')}: ${formatHighlight(gameStats?.mostDiscarder ?? null, t)}`,
      `${translateWithFallback(t, 'game.detail.stats.mostZimo', '最多自摸')}: ${formatHighlight(gameStats?.mostZimo ?? null, t)}`,
    ].join('\n');
    await Share.share({ title: bundle.game.title, message: summaryText });
  }, [bundle, gameStats, handsCount, isEnded, rankedPlayers, t]);

  const toggleExpand = useCallback((handId: string) => {
    setExpandedHands((prev) => ({ ...prev, [handId]: !prev[handId] }));
  }, []);

  const jumpToWind = useCallback(
    (wind: string) => {
      const sectionIndex = handSections.findIndex((section) => section.title === wind);
      if (sectionIndex < 0) {
        return;
      }
      sectionListRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        animated: true,
        viewPosition: 0,
      });
    },
    [handSections],
  );

  const renderHandItem = useCallback(
    ({ item }: { item: HandDisplay }) => {
      if (!bundle) {
        return null;
      }
      const hand = item.hand;
      const handRoundLabel = item.roundLabel;
      const dealerAction = parseDealerAction(hand.computedJson);
      const deltasQ = resolveDeltasQ(hand.deltasJson);
      const expanded = Boolean(expandedHands[hand.id]);
      const winnerName = hand.winnerPlayerId
        ? bundle.players.find((player) => player.id === hand.winnerPlayerId)?.name ?? '—'
        : '—';
      const discarderName = hand.discarderPlayerId
        ? bundle.players.find((player) => player.id === hand.discarderPlayerId)?.name ?? '—'
        : null;

      const outcomeLabel = hand.isDraw
        ? translateWithFallback(t, 'game.detail.hand.draw', '流局')
        : hand.type === 'zimo'
          ? translateWithFallback(t, 'game.detail.hand.zimo', '自摸')
          : hand.type === 'discard'
            ? translateWithFallback(t, 'game.detail.hand.discard', '點炮')
            : translateWithFallback(t, 'game.detail.hand.win', '胡');

      return (
        <Pressable
          key={hand.id}
          testID={`hand-row-${hand.id}`}
          onPress={() => toggleExpand(hand.id)}
          style={({ pressed }) => [styles.handRow, pressed && styles.handRowPressed]}
        >
          <View style={styles.handTopRow}>
            <Text style={styles.handIndex}>#{hand.handIndex + 1}</Text>
            <Text style={styles.handRound}>{handRoundLabel}</Text>
          </View>

          <View style={styles.handOutcomeRow}>
            <Text style={styles.handOutcomeIcon}>{hand.isDraw ? '⦿' : hand.type === 'zimo' ? '◎' : '•'}</Text>
            <Text style={styles.handOutcomeText}>{outcomeLabel}</Text>
            {hand.isDraw && dealerAction ? (
              <View style={styles.dealerActionBadge}>
                <Text style={styles.dealerActionText}>
                  {dealerAction === 'stick'
                    ? translateWithFallback(t, 'game.detail.hand.dealerAction.stick', '番莊')
                    : translateWithFallback(t, 'game.detail.hand.dealerAction.pass', '過莊')}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.handMetaText}>
            {hand.isDraw
              ? translateWithFallback(t, 'game.detail.hand.drawMeta', '流局')
              : discarderName
                ? `${winnerName} ← ${discarderName}`
                : winnerName}
          </Text>

          <View style={styles.deltaChipsRow}>
            {seatLabels.map((seat) => (
              <View key={`${hand.id}-delta-${seat.seatIndex}`} style={styles.deltaChip}>
                <Text style={styles.deltaChipSeat}>{seat.label}</Text>
                <Text style={styles.deltaChipValue}>
                  {deltasQ
                    ? formatSignedMoney((deltasQ[seat.seatIndex] ?? 0) / 4, bundle.game.currencySymbol ?? '')
                    : '—'}
                </Text>
              </View>
            ))}
          </View>

          {expanded ? (
            <View style={styles.expandedWrap}>
              <Text style={styles.expandedText}>
                {translateWithFallback(t, 'game.detail.hand.field.winnerSeat', '贏家座位')}：{hand.winnerSeatIndex ?? '—'}
              </Text>
              <Text style={styles.expandedText}>
                {translateWithFallback(t, 'game.detail.hand.field.winner', '贏家')}：{winnerName}
              </Text>
              {!hand.isDraw && discarderName ? (
                <Text style={styles.expandedText}>
                  {translateWithFallback(t, 'game.detail.hand.field.discarder', '點炮者')}：{discarderName}
                </Text>
              ) : null}
              {hand.isDraw && dealerAction ? (
                <Text style={styles.expandedText}>
                  {translateWithFallback(t, 'game.detail.hand.field.dealerAction', '莊家處理')}：
                  {dealerAction === 'stick'
                    ? translateWithFallback(t, 'game.detail.hand.dealerAction.stick', '番莊')
                    : translateWithFallback(t, 'game.detail.hand.dealerAction.pass', '過莊')}
                </Text>
              ) : null}
              <Text style={styles.expandedText}>
                {translateWithFallback(t, 'game.detail.hand.nextRound', '下一手')}：{hand.nextRoundLabelZh || '—'}
              </Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [bundle, expandedHands, seatLabels, t, toggleExpand],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: HandSection }) => (
      <Pressable
        testID={`wind-section-${section.title}`}
        onPress={() => {
          setCollapsedSections((prev) => {
            const isCollapsed = prev[section.title] !== false;
            return { ...prev, [section.title]: isCollapsed ? false : true };
          });
        }}
        style={styles.windSectionHeader}
      >
        <Text style={styles.windSectionTitle}>
          {section.totalCount > section.data.length
            ? translateWithFallback(
                t,
                'game.detail.hands.sectionPartial',
                '{wind}（顯示 {visible}/{total}）',
                {
                  wind: section.title,
                  visible: section.data.length,
                  total: section.totalCount,
                },
              )
            : section.title}
        </Text>
        <Text style={styles.windSectionToggle}>{collapsedSections[section.title] !== false ? '＋' : '－'}</Text>
      </Pressable>
    ),
    [collapsedSections, t],
  );

  const filterOptions: Array<{ key: HandFilter; label: string }> = useMemo(
    () => [
      { key: 'all', label: translateWithFallback(t, 'game.detail.hands.filter.all', '全部') },
      { key: 'wins', label: translateWithFallback(t, 'game.detail.hands.filter.wins', '胡牌') },
      { key: 'draws', label: translateWithFallback(t, 'game.detail.hands.filter.draws', '流局') },
    ],
    [t],
  );

  if (loading) {
    return (
      <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
        <View style={styles.loadingWrap}>
          <Text style={styles.metaText}>{translateWithFallback(t, 'game.detail.loading', '載入中…')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!bundle) {
    return (
      <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>{error ?? translateWithFallback(t, 'errors.loadGame', '載入對局失敗')}</Text>
          <AppButton
            label={translateWithFallback(t, 'common.back', '返回')}
            onPress={() => navigation.goBack()}
            variant="secondary"
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
      <SectionList
        ref={sectionListRef}
        sections={handSections.map((section) => ({
          ...section,
          data: collapsedSections[section.title] !== false ? [] : section.data,
        }))}
        keyExtractor={(item) => item.hand.id}
        renderItem={renderHandItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={(
          <>
            <Card style={styles.card}>
              <View style={styles.heroTopRow}>
                <Text style={styles.heroLabel}>
                  {translateWithFallback(t, 'game.detail.header.title', '對局總結')}
                </Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {translateWithFallback(t, 'game.detail.header.statusEnded', '已結束')}
                  </Text>
                </View>
              </View>
              <Text style={styles.headerTitle}>{bundle.game.title}</Text>
              <Text style={styles.heroSubTitle}>
                {`${bundle.game.currentRoundLabelZh ?? '—'} · ${translateWithFallback(
                  t,
                  'game.detail.header.handsPlayed',
                  '已打 {count} 鋪',
                  { count: handsCount },
                )}`}
              </Text>
              <View style={styles.headerRow}>
                <Text style={styles.heroDateText}>{formatDate(bundle.game.createdAt)}</Text>
              </View>
            </Card>

            {!isEnded ? (
              <Card style={styles.card}>
                <Text style={styles.warningText}>
                  {translateWithFallback(t, 'game.detail.readOnlyWarning', '此頁僅供已結束對局查看。')}
                </Text>
              </Card>
            ) : null}

            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>
                {translateWithFallback(t, 'game.detail.players.title', '玩家排名')}
              </Text>
              {rankedPlayers.map((player, index) => (
                <View key={`rank-${player.playerId}`} style={styles.playerRow}>
                  <Text style={styles.playerRank}>{getRankPrefix(index)}</Text>
                  <View style={styles.playerMetaWrap}>
                    <Text style={styles.playerName}>{player.name}</Text>
                  </View>
                  <Text style={styles.playerTotal}>
                    {formatSignedMoney(player.total, bundle.game.currencySymbol ?? '')}
                  </Text>
                </View>
              ))}
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>
                {translateWithFallback(t, 'game.detail.rules.title', '規則摘要')}
              </Text>
              <Text style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.variant', '牌型')}：{localizedVariant}
              </Text>
              <Text style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.currency', '幣別')}：
                {bundle.game.currencySymbol || '—'}
              </Text>
              {typeof rules?.minFanToWin === 'number' ? (
                <Text style={styles.metaText}>
                  {translateWithFallback(t, 'game.detail.rules.minFan', '最低番數')}：{rules.minFanToWin}
                </Text>
              ) : null}
              {rules?.variant === 'HK' ? (
                <>
                  <Text style={styles.metaText}>
                    {translateWithFallback(t, 'game.detail.rules.hkPreset', '計分模式')}：{localizedScoringPreset}
                  </Text>
                  <Text style={styles.metaText}>
                    {translateWithFallback(t, 'game.detail.rules.hkGunMode', '銃制')}：{localizedGunMode}
                  </Text>
                  <Text style={styles.metaText}>
                    {translateWithFallback(t, 'game.detail.rules.hkStake', '注碼')}：{localizedStakePreset}
                  </Text>
                  <Text style={styles.metaText}>
                    {translateWithFallback(t, 'game.detail.rules.hkCapFan', '爆棚')}：
                    {rules.hk?.capFan == null ? '∞' : rules.hk.capFan}
                  </Text>
                  <Text style={styles.metaText}>
                    {translateWithFallback(t, 'game.detail.rules.hkDealerMultiplier', '莊家加倍')}：
                    {rules.hk?.applyDealerMultiplier
                      ? translateWithFallback(t, 'game.detail.common.on', '開')
                      : translateWithFallback(t, 'game.detail.common.off', '關')}
                  </Text>
                  <Text style={styles.metaHintText}>
                    {translateWithFallback(
                      t,
                      'game.detail.rules.hkDealerMultiplier.hint',
                      '開啟時莊家相關結算會按規則加權。',
                    )}
                  </Text>
                </>
              ) : null}
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.stats.title', '統計')}</Text>
              <Text style={styles.statsHeadline}>
                {translateWithFallback(t, 'game.detail.stats.hands', '手數')}：{handsCount}
                {'  ·  '}
                {translateWithFallback(t, 'game.detail.stats.draws', '流局')}：{gameStats?.draws ?? 0}
              </Text>
              {rankedPlayers.map((player) => (
                <Text key={`wins-${player.playerId}`} style={styles.statsPlayerLine}>
                  {player.name}：
                  {translateWithFallback(t, 'game.detail.stats.wins', '胡牌')} {gameStats?.winsByPlayerId[player.playerId] ?? 0}
                  {' ｜ '}
                  {translateWithFallback(t, 'game.detail.stats.zimo', '自摸')} {gameStats?.zimoByPlayerId[player.playerId] ?? 0}
                </Text>
              ))}
              <Text style={styles.statsHighlightLine}>
                {translateWithFallback(t, 'game.detail.stats.mostDiscard', '最多出銃')}：
                {gameStats?.mostDiscarder ? `${gameStats.mostDiscarder.name} (${gameStats.mostDiscarder.count})` : '—'}
              </Text>
              <Text style={styles.statsHighlightLine}>
                {translateWithFallback(t, 'game.detail.stats.mostZimo', '最多自摸')}：
                {gameStats?.mostZimo ? `${gameStats.mostZimo.name} (${gameStats.mostZimo.count})` : '—'}
              </Text>
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.hands.title', '全部牌局')}</Text>
              <View style={styles.filterWrap}>
                {filterOptions.map((option) => {
                  const selected = handFilter === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      testID={`hands-filter-${option.key}`}
                      onPress={() => {
                        setHandFilter(option.key);
                        setVisibleHandsCount(20);
                        setCollapsedSections({});
                      }}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.jumpWrap}>
                <Text style={styles.jumpLabel}>
                  {translateWithFallback(t, 'game.detail.hands.jumpTo', '跳到：')}
                </Text>
                {jumpButtons.map((jump) => (
                  <Pressable
                    key={jump.wind}
                    testID={`jump-${jump.wind}`}
                    onPress={() => jumpToWind(jump.wind)}
                    style={styles.jumpButton}
                  >
                    <Text style={styles.jumpButtonText}>
                      {translateWithFallback(t, jump.key, jump.wind)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          </>
        )}
        ListFooterComponent={
          <>
            {visibleHandsCount < filteredHandDisplayList.length ? (
              <AppButton
                label={translateWithFallback(t, 'game.detail.hands.loadMore', '載入更多')}
                onPress={() => setVisibleHandsCount((prev) => prev + 20)}
                variant="secondary"
                style={styles.loadMoreButton}
              />
            ) : null}

            <View style={styles.actionsWrap}>
              <AppButton
                label={translateWithFallback(t, 'game.detail.action.share', '分享')}
                onPress={() => {
                  handleShare().catch((shareError) => console.error('[GameDashboard] share failed', shareError));
                }}
                disabled={!isEnded}
              />
            </View>
          </>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    marginBottom: theme.spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  heroLabel: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  headerTitle: {
    ...typography.title,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  heroSubTitle: {
    ...typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  headerRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  heroDateText: {
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(70,63,56,0.12)',
  },
  statusBadgeText: {
    ...typography.caption,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  warningText: {
    ...typography.body,
    color: theme.colors.danger,
  },
  sectionTitle: {
    ...typography.subtitle,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  metaText: {
    ...typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  metaHintText: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  playerRank: {
    width: 34,
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  playerMetaWrap: {
    flex: 1,
  },
  playerName: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  playerTotal: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  statsHeadline: {
    ...typography.body,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    fontWeight: '600',
  },
  statsPlayerLine: {
    ...typography.body,
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  statsHighlightLine: {
    ...typography.body,
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  filterWrap: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
  },
  filterChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.xs,
    backgroundColor: theme.colors.background,
  },
  filterChipActive: {
    backgroundColor: 'rgba(53,92,86,0.14)',
    borderColor: 'rgba(53,92,86,0.24)',
  },
  filterChipText: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: theme.colors.textPrimary,
  },
  jumpWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.xs,
  },
  jumpLabel: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.xs,
  },
  jumpButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.04)',
    marginRight: 6,
    marginBottom: 4,
  },
  jumpButtonText: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  handRow: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  handRowPressed: {
    opacity: 0.9,
  },
  windSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  windSectionTitle: {
    ...typography.body,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  windSectionToggle: {
    ...typography.body,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  handTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  handIndex: {
    ...typography.body,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  handRound: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  handOutcomeRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  handOutcomeIcon: {
    ...typography.body,
    color: theme.colors.textPrimary,
    marginRight: 6,
  },
  handOutcomeText: {
    ...typography.body,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  dealerActionBadge: {
    marginLeft: theme.spacing.xs,
    backgroundColor: 'rgba(53,92,86,0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dealerActionText: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  handMetaText: {
    marginTop: 6,
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  deltaChipsRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  deltaChip: {
    flex: 1,
    marginRight: 4,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: theme.colors.background,
  },
  deltaChipSeat: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  deltaChipValue: {
    marginTop: 2,
    ...typography.caption,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  expandedWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  expandedText: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  actionsWrap: {
    marginTop: theme.spacing.sm,
  },
  loadMoreButton: {
    marginTop: theme.spacing.sm,
  },
  errorText: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.md,
    ...typography.body,
  },
});

export default GameDashboardScreen;
