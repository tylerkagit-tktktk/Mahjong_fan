import { useFocusEffect } from '@react-navigation/native';
import AppText from '../components/AppText';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, SectionList, Share, StyleSheet, View } from 'react-native';
import AppButton from '../components/AppButton';
import Card from '../components/Card';
import ScreenContainer from '../components/ScreenContainer';
import { getGameBundle, reopenEndedGame } from '../db/repo';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { translateWithFallback } from '../i18n/translateWithFallback';
import { GameBundle } from '../models/db';
import {
  buildLocalDashboardProjection,
  type DashboardHandRow,
  type DashboardSettlementDirection,
} from '../domain/gameRecord/localDashboardProjection';
import { replayLocalGameBundle } from '../services/localGameReplay';
import { getLocalGameReopenAvailability } from '../domain/gameRecord/localLifecycle';
import { RootStackParamList } from '../navigation/types';
import theme from '../theme/theme';
import { typography } from '../styles/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'GameDashboard'>;

type SeatSummary = {
  playerId: string;
  name: string;
  total: number;
};

type SettlementTransfer = {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
};

type HandDisplay = {
  hand: DashboardHandRow;
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

function formatHighlight(value: { displayName: string; count: number } | null): string {
  if (!value) {
    return '—';
  }
  return `${value.displayName} (${value.count})`;
}

function buildShareRankingLines(
  rankedPlayers: SeatSummary[],
  symbol: string,
): string[] {
  return rankedPlayers.map((player, index) => {
    return `${index + 1}. ${player.name} ${formatSignedMoney(player.total, symbol)}`;
  });
}

function buildSettlementTransfers(rankedPlayers: SeatSummary[]): SettlementTransfer[] {
  const winners = rankedPlayers
    .filter((player) => player.total > 0)
    .map((player) => ({ ...player, remaining: Math.round(player.total) }))
    .sort((a, b) => b.remaining - a.remaining);
  const losers = rankedPlayers
    .filter((player) => player.total < 0)
    .map((player) => ({ ...player, remaining: Math.abs(Math.round(player.total)) }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: SettlementTransfer[] = [];
  losers.forEach((loser) => {
    for (const winner of winners) {
      if (loser.remaining <= 0) {
        break;
      }
      if (winner.remaining <= 0) {
        continue;
      }
      const amount = Math.min(loser.remaining, winner.remaining);
      if (amount <= 0) {
        continue;
      }
      transfers.push({ fromPlayerId: loser.playerId, toPlayerId: winner.playerId, amount });
      loser.remaining -= amount;
      winner.remaining -= amount;
    }
  });

  return transfers.filter((transfer) => transfer.amount > 0);
}

function buildSettlementDirectionLines(
  rankedPlayers: SeatSummary[],
  symbol: string,
  t: (key: TranslationKey) => string,
  canonicalDirections?: readonly DashboardSettlementDirection[],
): string[] {
  const transfers = canonicalDirections
    ? canonicalDirections.map((direction) => ({
        fromPlayerId: direction.fromPlayerId,
        toPlayerId: direction.toPlayerId,
        amount: direction.amountQ / 4,
      }))
    : buildSettlementTransfers(rankedPlayers);
  if (transfers.length === 0) {
    return ['—'];
  }
  const byFromPlayer = new Map<string, SettlementTransfer[]>();
  transfers.forEach((transfer) => {
    const list = byFromPlayer.get(transfer.fromPlayerId) ?? [];
    list.push(transfer);
    byFromPlayer.set(transfer.fromPlayerId, list);
  });
  const nameById = new Map(rankedPlayers.map((player) => [player.playerId, player.name]));
  const loserOrder = rankedPlayers.filter((player) => player.total < 0).map((player) => player.playerId);

  return loserOrder
    .filter((loserId) => byFromPlayer.has(loserId))
    .map((loserId) => {
      const transfersByLoser = byFromPlayer.get(loserId) ?? [];
      const details = transfersByLoser
        .map((transfer) => `${nameById.get(transfer.toPlayerId) ?? transfer.toPlayerId} ${symbol}${Math.round(transfer.amount)}`)
        .join(' / ');
      return `${nameById.get(loserId) ?? loserId} ${translateWithFallback(t, 'game.detail.share.settlementArrow', '→')} ${details}`;
    });
}

function getHandSummary(
  hand: DashboardHandRow,
  winnerName: string,
  discarderName: string | null,
  t: (key: TranslationKey) => string,
): string {
  const isDraw = hand.outcome === 'draw';
  if (isDraw) {
    return translateWithFallback(t, 'game.detail.hand.summary.draw', '流局');
  }

  const fanValueRaw = hand.fan;
  const fanValue = fanValueRaw === null || fanValueRaw === undefined ? '—' : String(fanValueRaw);
  const isZimo = hand.outcome === 'zimo';
  if (isZimo) {
    return translateWithFallback(t, 'game.detail.hand.summary.zimo', '{name} 自摸 {fan} 番', {
      name: winnerName || '—',
      fan: fanValue,
    });
  }

  return translateWithFallback(t, 'game.detail.hand.summary.discard', '{loser} 出銃比 {winner} {fan} 番', {
    loser: discarderName || '—',
    winner: winnerName || '—',
    fan: fanValue,
  });
}

function GameDashboardScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { t } = useAppLanguage();

  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedHands, setExpandedHands] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [handFilter, setHandFilter] = useState<HandFilter>('all');
  const [reopening, setReopening] = useState(false);

  const sectionListRef = useRef<SectionList<HandDisplay, HandSection>>(null);
  const nonEndedAlertShownRef = useRef(false);
  const reopeningRef = useRef(false);

  const loadBundle = useCallback(async () => {
    setError(null);
    const data = await getGameBundle(gameId);
    setBundle(data);
    setCollapsedSections({});
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

  const reopenAvailability = useMemo(
    () => bundle ? getLocalGameReopenAvailability({ bundle, replayResult: localReplayResult }) : null,
    [bundle, localReplayResult],
  );

  const gameStats = dashboardProjection?.projection.statistics ?? null;
  const ruleSummary = dashboardProjection?.projection.ruleSummary ?? null;

  const rankedPlayers = useMemo(() => {
    if (!dashboardProjection) {
      return [] as SeatSummary[];
    }
    return dashboardProjection.projection.players.map((entry) => ({
      playerId: entry.playerId,
      name: entry.displayName,
      total: entry.totalQ / 4,
    }));
  }, [dashboardProjection]);

  const handDisplayList = useMemo(() => {
    if (!dashboardProjection) {
      return [] as HandDisplay[];
    }
    return dashboardProjection.projection.hands.map((hand, index) => ({
      hand,
      index,
      roundLabel: hand.roundLabelZh,
      windLabel: hand.windLabelZh,
    }));
  }, [dashboardProjection]);

  const filteredHandDisplayList = useMemo(() => {
    if (handFilter === 'wins') {
      return handDisplayList.filter((entry) => entry.hand.outcome !== 'draw');
    }
    if (handFilter === 'draws') {
      return handDisplayList.filter((entry) => entry.hand.outcome === 'draw');
    }
    return handDisplayList;
  }, [handDisplayList, handFilter]);

  const totalCountByWind = useMemo(() => {
    const counts = new Map<string, number>();
    filteredHandDisplayList.forEach((entry) => {
      counts.set(entry.windLabel, (counts.get(entry.windLabel) ?? 0) + 1);
    });
    return counts;
  }, [filteredHandDisplayList]);

  const handSections = useMemo(() => {
    const sections = new Map<string, HandDisplay[]>();
    filteredHandDisplayList.forEach((entry) => {
      const list = sections.get(entry.windLabel) ?? [];
      list.push(entry);
      sections.set(entry.windLabel, list);
    });
    return Array.from(sections.entries()).map(([title, data]) => ({
      title,
      data,
      totalCount: totalCountByWind.get(title) ?? data.length,
    }));
  }, [filteredHandDisplayList, totalCountByWind]);

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
    const rankingLines = buildShareRankingLines(rankedPlayers, bundle.game.currencySymbol ?? '');
    const settlementLines = buildSettlementDirectionLines(
      rankedPlayers,
      bundle.game.currencySymbol ?? '',
      t,
      dashboardProjection?.source === 'canonical'
        ? dashboardProjection.projection.settlementDirections
        : undefined,
    );
    const playerStatsLines = rankedPlayers.map(
      (player) =>
        `${player.name}：${translateWithFallback(t, 'game.detail.stats.wins', '食糊')} ${
          gameStats?.winsByPlayerId[player.playerId] ?? 0
        }｜${translateWithFallback(t, 'game.detail.stats.zimo', '自摸')} ${
          gameStats?.zimoByPlayerId[player.playerId] ?? 0
        }｜${translateWithFallback(t, 'game.detail.stats.discards', '出銃')} ${
          gameStats?.discardByPlayerId[player.playerId] ?? 0
        }`,
    );
    const titleText = bundle.game.title || translateWithFallback(t, 'game.detail.header.title', '對局總結');
    const dateText = formatDate(bundle.game.createdAt);
    const summaryText = [
      `${titleText} — ${dateText}`,
      '',
      `${translateWithFallback(t, 'game.detail.players.title', '玩家排名')}:`,
      ...rankingLines,
      '',
      `${translateWithFallback(t, 'game.detail.share.settlementTitle', '結算方向')}:`,
      ...settlementLines,
      '',
      `${translateWithFallback(t, 'game.detail.stats.title', '統計')}:`,
      `${translateWithFallback(t, 'game.detail.header.handsPlayed', '已打 {count} 鋪', { count: handsCount })}`,
      `${translateWithFallback(t, 'game.detail.stats.draws', '流局')}: ${gameStats?.draws ?? 0}`,
      ...playerStatsLines,
      `${translateWithFallback(t, 'game.detail.stats.mostDiscard', '最多出銃')}: ${formatHighlight(gameStats?.mostDiscarder ?? null)}`,
      `${translateWithFallback(t, 'game.detail.stats.mostZimo', '最多自摸')}: ${formatHighlight(gameStats?.mostZimo ?? null)}`,
    ].join('\n');
    await Share.share({ title: bundle.game.title, message: summaryText });
  }, [bundle, dashboardProjection, gameStats, handsCount, isEnded, rankedPlayers, t]);

  const handleReopen = useCallback(() => {
    if (!bundle || !reopenAvailability?.available || reopeningRef.current) return;
    const lastHand = bundle.hands.slice().sort((left, right) => left.handIndex - right.handIndex).at(-1);
    if (!lastHand || bundle.game.endedAt == null) return;
    Alert.alert(
      translateWithFallback(t, 'game.detail.reopen.title', '重新開啟牌局'),
      translateWithFallback(t, 'game.detail.reopen.message', '牌局會變回進行中，現有完場結果會失效；所有已記錄手牌會保留，修改後要重新按完場。'),
      [
        { text: translateWithFallback(t, 'game.detail.action.cancel', '取消'), style: 'cancel' },
        {
          text: translateWithFallback(t, 'game.detail.reopen.confirm', '確認重新開啟'),
          onPress: async () => {
            if (reopeningRef.current) return;
            reopeningRef.current = true;
            setReopening(true);
            try {
              const result = await reopenEndedGame({
                gameId: bundle.game.id,
                expectedHandsCount: bundle.hands.length,
                expectedLastHandId: lastHand.id,
                expectedEndedAt: bundle.game.endedAt as number,
              });
              if (!result.ok) {
                if (result.code === 'STALE_REOPEN_TARGET' || result.code === 'GAME_NOT_ENDED') {
                  await loadBundle();
                  const staleMessage = translateWithFallback(t, 'game.detail.reopen.stale', '牌局已更新，請重新檢查。');
                  setError(staleMessage);
                  Alert.alert(translateWithFallback(t, 'game.detail.reopen.title', '重新開啟牌局'), staleMessage);
                  return;
                }
                const failedMessage = translateWithFallback(t, 'game.detail.reopen.failed', '重新開啟牌局失敗。');
                setError(failedMessage);
                Alert.alert(translateWithFallback(t, 'game.detail.reopen.title', '重新開啟牌局'), failedMessage);
                return;
              }
              navigation.replace('GameTable', { gameId: bundle.game.id });
            } catch {
              const failedMessage = translateWithFallback(t, 'game.detail.reopen.failed', '重新開啟牌局失敗。');
              setError(failedMessage);
              Alert.alert(translateWithFallback(t, 'game.detail.reopen.title', '重新開啟牌局'), failedMessage);
            } finally {
              reopeningRef.current = false;
              setReopening(false);
            }
          },
        },
      ],
    );
  }, [bundle, loadBundle, navigation, reopenAvailability?.available, t]);

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
      const dealerAction = hand.drawDealerAction;
      const deltasQ = hand.deltasQ;
      const expanded = Boolean(expandedHands[hand.id]);
      const winnerName = hand.winnerPlayerId
        ? bundle.players.find((player) => player.id === hand.winnerPlayerId)?.name ?? '—'
        : '—';
      const discarderName = hand.discarderPlayerId
        ? bundle.players.find((player) => player.id === hand.discarderPlayerId)?.name ?? '—'
        : null;

      const outcomeLabel = hand.outcome === 'draw'
        ? translateWithFallback(t, 'game.detail.hand.draw', '流局')
        : hand.outcome === 'zimo'
          ? translateWithFallback(t, 'game.detail.hand.zimo', '自摸')
          : translateWithFallback(t, 'game.detail.hand.discard', '點炮');

      return (
        <Pressable
          key={hand.id}
          testID={`hand-row-${hand.id}`}
          onPress={() => toggleExpand(hand.id)}
          style={({ pressed }) => [styles.handRow, pressed && styles.handRowPressed]}
        >
          <View style={styles.handTopRow}>
            <AppText style={styles.handIndex}>#{hand.handIndex + 1}</AppText>
            <AppText style={styles.handRound}>{handRoundLabel}</AppText>
          </View>

          <View style={styles.handOutcomeRow}>
            <AppText style={styles.handOutcomeIcon}>{hand.outcome === 'draw' ? '⦿' : hand.outcome === 'zimo' ? '◎' : '•'}</AppText>
            <AppText style={styles.handOutcomeText}>{outcomeLabel}</AppText>
            {hand.outcome === 'draw' && dealerAction ? (
              <View style={styles.dealerActionBadge}>
                <AppText style={styles.dealerActionText}>
                  {dealerAction === 'stick'
                    ? translateWithFallback(t, 'game.detail.hand.dealerAction.stick', '番莊')
                    : translateWithFallback(t, 'game.detail.hand.dealerAction.pass', '過莊')}
                </AppText>
              </View>
            ) : null}
          </View>

          <AppText style={styles.handMetaText}>{getHandSummary(hand, winnerName, discarderName, t)}</AppText>

          <View style={styles.deltaChipsRow}>
            {seatLabels.map((seat) => (
              <View key={`${hand.id}-delta-${seat.seatIndex}`} style={styles.deltaChip}>
                <AppText style={styles.deltaChipSeat}>{seat.label}</AppText>
                <AppText style={styles.deltaChipValue}>
                  {deltasQ
                    ? formatSignedMoney((deltasQ[seat.seatIndex] ?? 0) / 4, bundle.game.currencySymbol ?? '')
                    : '—'}
                </AppText>
              </View>
            ))}
          </View>

          {expanded ? (
            <View style={styles.expandedWrap}>
              <AppText style={styles.expandedText}>
                {translateWithFallback(t, 'game.detail.hand.field.winnerSeat', '贏家座位')}：{hand.winnerSeatIndex ?? '—'}
              </AppText>
              <AppText style={styles.expandedText}>
                {translateWithFallback(t, 'game.detail.hand.field.winner', '贏家')}：{winnerName}
              </AppText>
              {hand.outcome !== 'draw' && discarderName ? (
                <AppText style={styles.expandedText}>
                  {translateWithFallback(t, 'game.detail.hand.field.discarder', '點炮者')}：{discarderName}
                </AppText>
              ) : null}
              {hand.outcome === 'draw' && dealerAction ? (
                <AppText style={styles.expandedText}>
                  {translateWithFallback(t, 'game.detail.hand.field.dealerAction', '莊家處理')}：
                  {dealerAction === 'stick'
                    ? translateWithFallback(t, 'game.detail.hand.dealerAction.stick', '番莊')
                    : translateWithFallback(t, 'game.detail.hand.dealerAction.pass', '過莊')}
                </AppText>
              ) : null}
              <AppText style={styles.expandedText}>
                {translateWithFallback(t, 'game.detail.hand.nextRound', '下一手')}：{hand.nextRoundLabelZh || '—'}
              </AppText>
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
        <AppText style={styles.windSectionTitle}>
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
        </AppText>
        <AppText style={styles.windSectionToggle}>{collapsedSections[section.title] !== false ? '＋' : '－'}</AppText>
      </Pressable>
    ),
    [collapsedSections, t],
  );

  const filterOptions: Array<{ key: HandFilter; label: string }> = useMemo(
    () => [
      { key: 'all', label: translateWithFallback(t, 'game.detail.hands.filter.all', '全部') },
      { key: 'wins', label: translateWithFallback(t, 'game.detail.hands.filter.wins', '食糊') },
      { key: 'draws', label: translateWithFallback(t, 'game.detail.hands.filter.draws', '流局') },
    ],
    [t],
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
              {rankedPlayers.map((player, index) => (
                <View key={`rank-${player.playerId}`} style={styles.playerRow}>
                  <AppText style={styles.playerRank}>{getRankPrefix(index)}</AppText>
                  <View style={styles.playerMetaWrap}>
                    <AppText style={styles.playerName}>{player.name}</AppText>
                  </View>
                  <AppText style={styles.playerTotal}>
                    {formatSignedMoney(player.total, bundle.game.currencySymbol ?? '')}
                  </AppText>
                </View>
              ))}
            </Card>

            <Card style={styles.card}>
              <AppText style={styles.sectionTitle}>
                {translateWithFallback(t, 'game.detail.rules.title', '規則摘要')}
              </AppText>
              <AppText style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.variant', '牌型')}：{localizedVariant}
              </AppText>
              <AppText style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.currency', '幣別')}：
                {ruleSummary?.currencySymbol || '—'}
              </AppText>
              {typeof ruleSummary?.minFanToWin === 'number' ? (
                <AppText style={styles.metaText}>
                  {translateWithFallback(t, 'game.detail.rules.minFan', '最低番數')}：{ruleSummary.minFanToWin}
                </AppText>
              ) : null}
              {ruleSummary?.variant === 'HK' ? (
                <>
                  <AppText style={styles.metaText}>
                    {translateWithFallback(t, 'game.detail.rules.hkPreset', '計分模式')}：{localizedScoringPreset}
                  </AppText>
                  {ruleSummary.scoringPreset === 'traditionalFan' ? (
                    <>
                      <AppText style={styles.metaText}>
                        {translateWithFallback(t, 'game.detail.rules.hkGunMode', '銃制')}：{localizedGunMode}
                      </AppText>
                      <AppText style={styles.metaText}>
                        {translateWithFallback(t, 'game.detail.rules.hkStake', '注碼')}：{localizedStakePreset}
                      </AppText>
                    </>
                  ) : null}
                  {customUnitPerFanLine ? (
                    <AppText style={styles.metaText}>{customUnitPerFanLine}</AppText>
                  ) : null}
                  {customMultiplierSummary ? (
                    <AppText style={styles.metaText}>{customMultiplierSummary}</AppText>
                  ) : null}
                  <AppText style={styles.metaText}>
                    {translateWithFallback(t, 'game.detail.rules.hkCapFan', '爆棚')}：
                    {ruleSummary.capFan == null ? '∞' : ruleSummary.capFan}
                  </AppText>
                </>
              ) : null}
            </Card>

            <Card style={styles.card}>
              <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.stats.title', '統計')}</AppText>
              <AppText style={styles.statsHeadline}>
                {translateWithFallback(t, 'game.detail.stats.hands', '手數')}：{handsCount}
                {'  ·  '}
                {translateWithFallback(t, 'game.detail.stats.draws', '流局')}：{gameStats?.draws ?? 0}
              </AppText>
              {rankedPlayers.map((player) => (
                <AppText key={`wins-${player.playerId}`} style={styles.statsPlayerLine}>
                  {player.name}：
                  {translateWithFallback(t, 'game.detail.stats.wins', '食糊')} {gameStats?.winsByPlayerId[player.playerId] ?? 0}
                  {' ｜ '}
                  {translateWithFallback(t, 'game.detail.stats.zimo', '自摸')} {gameStats?.zimoByPlayerId[player.playerId] ?? 0}
                  {' ｜ '}
                  {translateWithFallback(t, 'game.detail.stats.discards', '出銃')} {gameStats?.discardByPlayerId[player.playerId] ?? 0}
                </AppText>
              ))}
              <AppText style={styles.statsHighlightLine}>
                {translateWithFallback(t, 'game.detail.stats.mostDiscard', '最多出銃')}：
                {gameStats?.mostDiscarder ? `${gameStats.mostDiscarder.displayName} (${gameStats.mostDiscarder.count})` : '—'}
              </AppText>
              <AppText style={styles.statsHighlightLine}>
                {translateWithFallback(t, 'game.detail.stats.mostZimo', '最多自摸')}：
                {gameStats?.mostZimo ? `${gameStats.mostZimo.displayName} (${gameStats.mostZimo.count})` : '—'}
              </AppText>
            </Card>

            <Card style={styles.card}>
              <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.hands.title', '全部牌局')}</AppText>
              <View style={styles.filterWrap}>
                {filterOptions.map((option) => {
                  const selected = handFilter === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      testID={`hands-filter-${option.key}`}
                      onPress={() => {
                        setHandFilter(option.key);
                        setCollapsedSections({});
                      }}
                      style={[styles.filterChip, selected && styles.filterChipActive]}
                    >
                      <AppText style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.jumpWrap}>
                <AppText style={styles.jumpLabel}>
                  {translateWithFallback(t, 'game.detail.hands.jumpTo', '跳到：')}
                </AppText>
                {jumpButtons.map((jump) => (
                  <Pressable
                    key={jump.wind}
                    testID={`jump-${jump.wind}`}
                    onPress={() => jumpToWind(jump.wind)}
                    style={styles.jumpButton}
                  >
                    <AppText style={styles.jumpButtonText}>
                      {translateWithFallback(t, jump.key, jump.wind)}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </Card>
          </>
        )}
        ListFooterComponent={
          <>
            <View style={styles.actionsWrap}>
              {reopenAvailability?.available ? (
                <AppButton
                  label={translateWithFallback(t, 'game.detail.reopen.action', '重新開啟牌局')}
                  onPress={handleReopen}
                  disabled={reopening}
                  variant="secondary"
                  testID="dashboard-reopen"
                  accessibilityLabel={translateWithFallback(t, 'game.detail.reopen.action', '重新開啟牌局')}
                />
              ) : null}
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
  errorText: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.md,
    ...typography.body,
  },
});

export default GameDashboardScreen;
