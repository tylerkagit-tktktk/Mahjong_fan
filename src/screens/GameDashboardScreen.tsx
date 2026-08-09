import { useFocusEffect } from '@react-navigation/native';
import AppText from '../components/AppText';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, SectionList, Share, StyleSheet, View } from 'react-native';
import AppButton from '../components/AppButton';
import Card from '../components/Card';
import HeaderIconButton from '../components/HeaderIconButton';
import ScreenContainer from '../components/ScreenContainer';
import { getGameBundle } from '../db/repo';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { translateWithFallback } from '../i18n/translateWithFallback';
import { GameBundle } from '../models/db';
import {
  buildLocalDashboardProjection,
  type DashboardHandRow,
} from '../domain/gameRecord/localDashboardProjection';
import {
  getTopDashboardPlayers,
  rankDashboardPlayers,
  type DashboardRankedPlayer,
  type DashboardTopPlayers,
} from '../domain/gameRecord/dashboardResultPresentation';
import { replayLocalGameBundle } from '../services/localGameReplay';
import { RootStackParamList } from '../navigation/types';
import theme from '../theme/theme';
import { typography } from '../styles/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'GameDashboard'>;

type HandDisplay = {
  hand: DashboardHandRow;
  roundLabel: string;
  windLabel: string;
};

type HandSection = {
  title: string;
  data: HandDisplay[];
};

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

function getRankPrefix(rank: number): string {
  if (rank === 1) {
    return '🥇';
  }
  if (rank === 2) {
    return '🥈';
  }
  if (rank === 3) {
    return '🥉';
  }
  return `${rank}.`;
}

function formatHighlight(value: DashboardTopPlayers | null): string {
  if (!value || value.players.length === 0) {
    return '—';
  }
  return `${value.players.map((player) => player.displayName).join(', ')} ×${value.count}`;
}

function buildShareRankingLines(
  rankedPlayers: DashboardRankedPlayer[],
  symbol: string,
): string[] {
  return rankedPlayers.map((player) => {
    return `${player.rank}. ${player.displayName} ${formatSignedMoney(player.totalQ / 4, symbol)}`;
  });
}

function getHandSummary(
  hand: DashboardHandRow,
  winnerName: string,
  discarderName: string | null,
  t: (key: TranslationKey) => string,
): string {
  if (hand.outcome === 'draw') {
    const dealerAction = hand.drawDealerAction === 'pass'
      ? translateWithFallback(t, 'game.detail.timeline.dealerAction.pass', '過莊')
      : translateWithFallback(t, 'game.detail.timeline.dealerAction.stick', '留莊');
    return translateWithFallback(t, 'game.detail.timeline.summary.draw', '流局 · {dealerAction}', { dealerAction });
  }

  const fanValueRaw = hand.fan;
  const fanValue = fanValueRaw === null || fanValueRaw === undefined ? '—' : String(fanValueRaw);
  const isZimo = hand.outcome === 'zimo';
  if (isZimo) {
    return translateWithFallback(t, 'game.detail.timeline.summary.zimo', '{name} 自摸 · {fan} 番', {
      name: winnerName || '—',
      fan: fanValue,
    });
  }

  return translateWithFallback(t, 'game.detail.timeline.summary.discard', '{winner} 食糊 · {loser} 出銃 · {fan} 番', {
    loser: discarderName || '—',
    winner: winnerName || '—',
    fan: fanValue,
  });
}

function getWinnerGain(
  hand: DashboardHandRow,
  winnerName: string,
  currencySymbol: string,
): string | null {
  if (hand.outcome === 'draw' || !hand.winnerPlayerId || !hand.deltasQ) {
    return null;
  }
  const winnerSeatIndex = hand.effectiveSeats.find((seat) => seat.playerId === hand.winnerPlayerId)?.seatIndex;
  if (winnerSeatIndex === undefined) {
    return null;
  }
  return `${winnerName} ${formatSignedMoney((hand.deltasQ[winnerSeatIndex] ?? 0) / 4, currencySymbol)}`;
}

function GameDashboardScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { t } = useAppLanguage();

  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);

  const nonEndedAlertShownRef = useRef(false);
  const mountedRef = useRef(true);
  const sharingRef = useRef(false);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const loadBundle = useCallback(async () => {
    setError(null);
    const data = await getGameBundle(gameId);
    setBundle(data);
    setRulesExpanded(false);
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

  const localReplayResult = useMemo(() => {
    if (!bundle || bundle.game.gameState !== 'ended') return null;
    return replayLocalGameBundle(bundle);
  }, [bundle]);

  const dashboardProjection = useMemo(() => {
    if (!bundle) {
      return null;
    }
    return buildLocalDashboardProjection({ bundle, localReplayResult });
  }, [bundle, localReplayResult]);

  const gameStats = dashboardProjection?.projection.statistics ?? null;
  const ruleSummary = dashboardProjection?.projection.ruleSummary ?? null;

  const rankedPlayers = useMemo(() => {
    if (!dashboardProjection) {
      return [] as DashboardRankedPlayer[];
    }
    return rankDashboardPlayers(dashboardProjection.projection.players.map((entry) => ({
      playerId: entry.playerId,
      displayName: entry.displayName,
      totalQ: entry.totalQ,
    })));
  }, [dashboardProjection]);

  const zimoHighlight = useMemo(
    () => getTopDashboardPlayers(rankedPlayers, gameStats?.zimoByPlayerId ?? {}),
    [gameStats?.zimoByPlayerId, rankedPlayers],
  );
  const discardHighlight = useMemo(
    () => getTopDashboardPlayers(rankedPlayers, gameStats?.discardByPlayerId ?? {}),
    [gameStats?.discardByPlayerId, rankedPlayers],
  );

  const handDisplayList = useMemo(() => {
    if (!dashboardProjection) {
      return [] as HandDisplay[];
    }
    return dashboardProjection.projection.hands
      .slice()
      .sort((left, right) => left.handIndex - right.handIndex)
      .map((hand) => ({
      hand,
      roundLabel: hand.roundLabelZh,
      windLabel: hand.windLabelZh,
      }));
  }, [dashboardProjection]);

  const handSections = useMemo(() => {
    const sections = new Map<string, HandDisplay[]>();
    handDisplayList.forEach((entry) => {
      const list = sections.get(entry.windLabel) ?? [];
      list.push(entry);
      sections.set(entry.windLabel, list);
    });
    return Array.from(sections.entries()).map(([title, data]) => ({
      title,
      data,
    }));
  }, [handDisplayList]);

  const handsCount = gameStats?.handsCount ?? bundle?.game.handsCount ?? 0;

  const localizedScoringPreset = useMemo(() => {
    const preset = ruleSummary?.scoringPreset;
    if (!preset) {
      return '—';
    }
    if (preset === 'traditionalFan') {
      return translateWithFallback(t, 'game.detail.rules.hkPreset.traditionalFan', '傳統番數');
    }
    if (preset === 'customTable') {
      return translateWithFallback(t, 'game.detail.rules.mode.custom', '自訂番數（價錢表）');
    }
    return '—';
  }, [ruleSummary?.scoringPreset, t]);

  const localizedGunMode = useMemo(() => {
    const mode = ruleSummary?.gunMode;
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
  }, [ruleSummary?.gunMode, t]);

  const localizedStakePreset = useMemo(() => {
    const stakePreset = ruleSummary?.stakePreset;
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
  }, [ruleSummary?.stakePreset, t]);

  const customUnitPerFanLine = useMemo(() => {
    if (ruleSummary?.variant !== 'HK' || ruleSummary.scoringPreset !== 'customTable') {
      return null;
    }
    const amountLabel = translateWithFallback(t, 'game.detail.rules.custom.unitPerFanLabel', '每番金額');
    return `${amountLabel}：${ruleSummary.currencySymbol}${String(ruleSummary.unitPerFan ?? 1)}`;
  }, [ruleSummary, t]);

  const customMultiplierSummary = useMemo(() => {
    if (ruleSummary?.variant !== 'HK' || ruleSummary.scoringPreset !== 'customTable') {
      return null;
    }
    return translateWithFallback(
      t,
      'game.detail.rules.custom.multiplierSummary',
      '自摸：3 份；出銃：2 份',
    );
  }, [ruleSummary, t]);

  const localizedVariant = useMemo(() => {
    if (ruleSummary?.variant === 'HK') {
      return translateWithFallback(t, 'newGame.variant.hk', '香港牌');
    }
    if (ruleSummary?.variant === 'TW' || ruleSummary?.variant === 'TW_SIMPLE') {
      return translateWithFallback(t, 'newGame.variant.twSimple', '台牌');
    }
    if (ruleSummary?.variant === 'PMA') {
      return translateWithFallback(t, 'newGame.variant.pma', '跑馬仔');
    }
    return '—';
  }, [ruleSummary?.variant, t]);

  const handleShare = useCallback(async () => {
    if (!bundle || sharingRef.current) {
      return;
    }
    if (!isEnded) {
      Alert.alert(
        translateWithFallback(t, 'game.detail.readOnlyBlockedTitle', '只可查看已結束對局'),
        translateWithFallback(t, 'game.detail.readOnlyWarning', '此頁僅供已結束對局查看。'),
      );
      return;
    }
    const rankingLines = buildShareRankingLines(rankedPlayers, bundle.game.currencySymbol ?? '');
    const titleText = bundle.game.title || translateWithFallback(t, 'game.detail.header.title', '對局總結');
    const dateText = formatDate(bundle.game.createdAt);
    const summaryText = [
      `${titleText} — ${dateText}`,
      '',
      translateWithFallback(t, 'game.detail.share.resultTitle', '牌局戰果'),
      ...rankingLines,
      '',
      `${translateWithFallback(t, 'game.detail.header.handsPlayed', '已打 {count} 鋪', { count: handsCount })} · ${translateWithFallback(t, 'game.detail.stats.draws', '流局')} ${gameStats?.draws ?? 0}`,
      `${translateWithFallback(t, 'game.detail.highlights.topZimo', '最多自摸')}：${formatHighlight(zimoHighlight)}`,
      `${translateWithFallback(t, 'game.detail.highlights.topDiscard', '最多出銃')}：${formatHighlight(discardHighlight)}`,
    ].join('\n');
    sharingRef.current = true;
    setSharing(true);
    try {
      await Share.share({ title: bundle.game.title, message: summaryText });
    } catch {
      Alert.alert(
        translateWithFallback(t, 'game.detail.share.failedTitle', '未能分享結果'),
        translateWithFallback(t, 'game.detail.share.failedMessage', '請稍後再試。'),
      );
    } finally {
      sharingRef.current = false;
      if (mountedRef.current) setSharing(false);
    }
  }, [bundle, discardHighlight, gameStats?.draws, handsCount, isEnded, rankedPlayers, t, zimoHighlight]);

  const shareAccessibilityLabel = translateWithFallback(
    t,
    'game.detail.action.shareResult',
    '分享戰果',
  );

  const renderHeaderShare = useCallback(
    () => (
      <HeaderIconButton
        testID="dashboard-header-share"
        icon="↥"
        onPress={() => { handleShare().catch(() => {}); }}
        accessibilityLabel={shareAccessibilityLabel}
        disabled={!isEnded || sharing}
        fontSize={24}
      />
    ),
    [handleShare, isEnded, shareAccessibilityLabel, sharing],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: renderHeaderShare,
      unstable_headerRightItems: () => [{
        type: 'button',
        label: shareAccessibilityLabel,
        accessibilityLabel: shareAccessibilityLabel,
        icon: { type: 'sfSymbol', name: 'square.and.arrow.up' },
        disabled: !isEnded || sharing,
        onPress: () => { handleShare().catch(() => {}); },
      }],
    });
  }, [handleShare, isEnded, navigation, renderHeaderShare, shareAccessibilityLabel, sharing]);

  const renderHandItem = useCallback(
    ({ item }: { item: HandDisplay }) => {
      if (!bundle) {
        return null;
      }
      const hand = item.hand;
      const handRoundLabel = item.roundLabel;
      const winnerName = hand.winnerPlayerId
        ? rankedPlayers.find((player) => player.playerId === hand.winnerPlayerId)?.displayName ?? '—'
        : '—';
      const discarderName = hand.discarderPlayerId
        ? rankedPlayers.find((player) => player.playerId === hand.discarderPlayerId)?.displayName ?? '—'
        : null;
      const summary = getHandSummary(hand, winnerName, discarderName, t);
      const winnerGain = getWinnerGain(hand, winnerName, bundle.game.currencySymbol ?? '');
      const accessibilityLabel = translateWithFallback(
        t,
        'game.detail.accessibility.timeline',
        '{round}，{summary}',
        { round: handRoundLabel, summary },
      );

      return (
        <View
          key={hand.id}
          testID={`hand-row-${hand.id}`}
          accessible
          accessibilityLabel={accessibilityLabel}
          style={styles.handRow}
        >
          <View style={styles.handTopRow}>
            <AppText style={styles.handRound}>{handRoundLabel}</AppText>
            <AppText style={styles.handIndex}>#{hand.handIndex + 1}</AppText>
          </View>
          <AppText style={styles.handSummary}>{summary}</AppText>
          {winnerGain ? <AppText style={styles.handGain}>{winnerGain}</AppText> : null}
        </View>
      );
    },
    [bundle, rankedPlayers, t],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: HandSection }) => (
      <View testID={`wind-section-${section.title}`} style={styles.windSectionHeader}>
        <AppText style={styles.windSectionTitle}>{section.title}</AppText>
      </View>
    ),
    [],
  );

  if (loading) {
    return (
      <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
        <View style={styles.loadingWrap}>
          <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.loading', '載入中…')}</AppText>
        </View>
      </ScreenContainer>
    );
  }

  if (!bundle) {
    return (
      <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
        <View style={styles.loadingWrap}>
          <AppText style={styles.errorText}>{error ?? translateWithFallback(t, 'errors.loadGame', '載入對局失敗')}</AppText>
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
        sections={handSections}
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
                <AppText style={styles.heroLabel}>
                  {translateWithFallback(t, 'game.detail.header.title', '對局總結')}
                </AppText>
                <View style={styles.statusBadge}>
                  <AppText style={styles.statusBadgeText}>
                    {translateWithFallback(t, 'game.detail.header.statusEnded', '已結束')}
                  </AppText>
                </View>
              </View>
              <AppText style={styles.headerTitle}>{bundle.game.title}</AppText>
              <AppText style={styles.heroSubTitle}>
                {`${bundle.game.currentRoundLabelZh ?? '—'} · ${translateWithFallback(
                  t,
                  'game.detail.header.handsPlayed',
                  '已打 {count} 鋪',
                  { count: handsCount },
                )}`}
              </AppText>
              <View style={styles.headerRow}>
                <AppText style={styles.heroDateText}>{formatDate(bundle.game.createdAt)}</AppText>
              </View>
            </Card>

            {!isEnded ? (
              <Card style={styles.card}>
                <AppText style={styles.warningText}>
                  {translateWithFallback(t, 'game.detail.readOnlyWarning', '此頁僅供已結束對局查看。')}
                </AppText>
              </Card>
            ) : null}

            <Card style={styles.card}>
              <AppText style={styles.sectionTitle}>
                {translateWithFallback(t, 'game.detail.players.title', '玩家排名')}
              </AppText>
              {rankedPlayers.map((player) => (
                <View
                  key={`rank-${player.playerId}`}
                  accessible
                  accessibilityLabel={translateWithFallback(
                    t,
                    'game.detail.accessibility.rank',
                    '第 {rank} 名，{name}，最終 {amount}',
                    { rank: player.rank, name: player.displayName, amount: formatSignedMoney(player.totalQ / 4, bundle.game.currencySymbol ?? '') },
                  )}
                  style={styles.playerRow}
                >
                  <AppText style={styles.playerRank}>{getRankPrefix(player.rank)}</AppText>
                  <View style={styles.playerMetaWrap}>
                    <AppText numberOfLines={1} ellipsizeMode="tail" style={styles.playerName}>{player.displayName}</AppText>
                  </View>
                  <AppText style={styles.playerTotal}>
                    {formatSignedMoney(player.totalQ / 4, bundle.game.currencySymbol ?? '')}
                  </AppText>
                </View>
              ))}
            </Card>

            <Card style={styles.card}>
              <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.highlights.title', '牌局統計')}</AppText>
              <View style={styles.highlightsGrid}>
                <View style={styles.highlightCell}>
                  <AppText style={styles.highlightLabel}>{translateWithFallback(t, 'game.detail.stats.hands', '手數')}</AppText>
                  <AppText style={styles.highlightValue}>{handsCount}</AppText>
                </View>
                <View style={styles.highlightCell}>
                  <AppText style={styles.highlightLabel}>{translateWithFallback(t, 'game.detail.stats.draws', '流局')}</AppText>
                  <AppText style={styles.highlightValue}>{gameStats?.draws ?? 0}</AppText>
                </View>
                <View style={styles.highlightCell}>
                  <AppText style={styles.highlightLabel}>{translateWithFallback(t, 'game.detail.highlights.topZimo', '最多自摸')}</AppText>
                  <AppText style={styles.highlightName}>{formatHighlight(zimoHighlight)}</AppText>
                </View>
                <View style={styles.highlightCell}>
                  <AppText style={styles.highlightLabel}>{translateWithFallback(t, 'game.detail.highlights.topDiscard', '最多出銃')}</AppText>
                  <AppText style={styles.highlightName}>{formatHighlight(discardHighlight)}</AppText>
                </View>
              </View>
            </Card>

            <View style={styles.historyTitleWrap}>
              <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.hands.title', '牌局紀錄')}</AppText>
            </View>
          </>
        )}
        ListFooterComponent={
          <Card style={styles.card}>
            <Pressable
              testID="dashboard-rules-toggle"
              accessibilityRole="button"
              accessibilityLabel={translateWithFallback(t, 'game.detail.rules.title', '規則摘要')}
              accessibilityState={{ expanded: rulesExpanded }}
              onPress={() => setRulesExpanded((expanded) => !expanded)}
              style={styles.rulesHeader}
            >
              <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.rules.title', '規則摘要')}</AppText>
              <AppText style={styles.rulesToggle}>{rulesExpanded ? '－' : '＋'}</AppText>
            </Pressable>
            {rulesExpanded ? (
              <View>
                <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.variant', '牌型')}：{localizedVariant}</AppText>
                <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.currency', '幣別')}：{ruleSummary?.currencySymbol || '—'}</AppText>
                {typeof ruleSummary?.minFanToWin === 'number' ? <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.minFan', '最低番數')}：{ruleSummary.minFanToWin}</AppText> : null}
                {ruleSummary?.variant === 'HK' ? (
                  <>
                    <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.hkPreset', '計分模式')}：{localizedScoringPreset}</AppText>
                    {ruleSummary.scoringPreset === 'traditionalFan' ? <><AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.hkGunMode', '銃制')}：{localizedGunMode}</AppText><AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.hkStake', '注碼')}：{localizedStakePreset}</AppText></> : null}
                    {customUnitPerFanLine ? <AppText style={styles.metaText}>{customUnitPerFanLine}</AppText> : null}
                    {customMultiplierSummary ? <AppText style={styles.metaText}>{customMultiplierSummary}</AppText> : null}
                    <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.hkCapFan', '爆棚')}：{ruleSummary.capFan == null ? '∞' : ruleSummary.capFan}</AppText>
                  </>
                ) : null}
              </View>
            ) : null}
          </Card>
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
    minWidth: 0,
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
    flexShrink: 0,
    marginLeft: theme.spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  highlightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -theme.spacing.xs,
  },
  highlightCell: {
    width: '50%',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  highlightLabel: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  highlightValue: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  highlightName: {
    ...typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  historyTitleWrap: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.md,
    borderTopRightRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  handRow: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  windSectionHeader: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  rulesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rulesToggle: {
    ...typography.body,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  windSectionTitle: {
    ...typography.subtitle,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  handTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  handIndex: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  handRound: {
    ...typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  handSummary: {
    marginTop: 4,
    ...typography.body,
    color: theme.colors.textPrimary,
  },
  handGain: {
    marginTop: 4,
    ...typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  errorText: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.md,
    ...typography.body,
  },
});

export default GameDashboardScreen;
