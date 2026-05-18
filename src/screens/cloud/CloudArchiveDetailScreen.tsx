import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import AppButton from '../../components/AppButton';
import Card from '../../components/Card';
import ScreenContainer from '../../components/ScreenContainer';
import { computeHkSettlement, toAmountFromQ } from '../../domain/hk/settlement';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { TranslationKey } from '../../i18n/types';
import { CloudArchivePayload, HandLog, RoomLineup, SeatKey } from '../../models/cloud';
import { parseRules, RulesV1 } from '../../models/rules';
import { RootStackParamList } from '../../navigation/types';
import { loadArchivedGame } from '../../services/cloud/archiveRepo';
import { typography } from '../../styles/typography';
import theme from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CloudArchiveDetail'>;

type PlayerTotal = {
  playerId: string;
  name: string;
  total: number;
};

type ArchiveSummary = {
  roundLabel: string;
  roundIndex: number;
  handCount: number;
  rankedPlayers: PlayerTotal[];
};

type ArchiveStats = {
  draws: number;
  winsByPlayerId: Record<string, number>;
  zimoByPlayerId: Record<string, number>;
  discardByPlayerId: Record<string, number>;
  mostDiscarder: { name: string; count: number } | null;
  mostZimo: { name: string; count: number } | null;
};

type ArchiveHandDisplay = {
  hand: HandLog;
  roundLabel: string;
  windLabel: string;
  winnerName: string;
  discarderName: string | null;
  deltasQ: number[] | null;
};

type ArchiveDetails = {
  summary: ArchiveSummary;
  stats: ArchiveStats;
  handDisplays: ArchiveHandDisplay[];
};

type HandFilter = 'all' | 'wins' | 'draws';

const SEAT_KEYS: SeatKey[] = ['0', '1', '2', '3'];
const SEAT_GLYPHS = ['東', '南', '西', '北'] as const;

function translateWithFallback(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  key: string,
  fallback: string,
  replacements?: Record<string, string | number>,
): string {
  const raw = t(key as TranslationKey, replacements);
  const base = raw === key ? fallback : raw;
  if (!replacements) {
    return base;
  }
  return Object.entries(replacements).reduce((result, [token, value]) => {
    const valueText = String(value);
    const doublePattern = new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, 'g');
    const singlePattern = new RegExp(`\\{${token}\\}`, 'g');
    return result.replace(doublePattern, valueText).replace(singlePattern, valueText);
  }, base);
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return '-';
  }
  const date = new Date(timestamp);
  const dd = `${date.getDate()}`.padStart(2, '0');
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatSignedMoney(value: number, symbol: string): string {
  const rounded = Math.round(value);
  if (rounded === 0) {
    return '0';
  }
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${symbol}${Math.abs(rounded)}`;
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

function formatHighlight(value: { name: string; count: number } | null): string {
  if (!value) {
    return '—';
  }
  return `${value.name} (${value.count})`;
}

function getCloudRoundLabel(roundIndex: number, dealerSeatIndex: number): string {
  const roundWind = SEAT_GLYPHS[(roundIndex - 1) % SEAT_GLYPHS.length] ?? '東';
  const dealerWind = SEAT_GLYPHS[dealerSeatIndex] ?? '東';
  return `${roundWind}風${dealerWind}局`;
}

function getSeatPlayerIds(lineup: RoomLineup | null): Array<string | null> {
  return SEAT_KEYS.map((seatKey) => lineup?.seats[seatKey] ?? null);
}

function getDealerSeatIndexAfterHand(
  dealerSeatIndex: number,
  hand: HandLog,
  lineup: RoomLineup | null,
): number {
  if (hand.type === 'draw') {
    return hand.dealerAction === 'pass' ? (dealerSeatIndex + 1) % 4 : dealerSeatIndex;
  }

  const winnerSeatIndex = getSeatPlayerIds(lineup).findIndex((playerId) => playerId === hand.winnerPlayerId);
  if (winnerSeatIndex < 0 || winnerSeatIndex === dealerSeatIndex) {
    return dealerSeatIndex;
  }
  return (dealerSeatIndex + 1) % 4;
}

function getLineupForHand(lineups: RoomLineup[], hand: HandLog): RoomLineup | null {
  return (
    lineups.find((lineup) => lineup.lineupVersion === hand.lineupVersion) ??
    [...lineups]
      .reverse()
      .find((lineup) => lineup.effectiveFromHandIndex <= hand.handIndex) ??
    lineups[0] ??
    null
  );
}

function buildNameMap(payload: CloudArchivePayload): Map<string, string> {
  const map = new Map<string, string>();
  for (const member of payload.members) {
    map.set(member.uid, member.displayName);
  }
  for (const player of payload.tempPlayers) {
    map.set(player.tempPlayerId, player.displayName);
  }
  return map;
}

function getMostCount(
  counts: Record<string, number>,
  nameById: Map<string, string>,
): { name: string; count: number } | null {
  const best = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([aId, aCount], [bId, bCount]) => bCount - aCount || (nameById.get(aId) ?? aId).localeCompare(nameById.get(bId) ?? bId, 'zh-Hant'))[0];
  if (!best) {
    return null;
  }
  const [playerId, count] = best;
  return { name: nameById.get(playerId) ?? playerId, count };
}

function buildArchiveDetails(payload: CloudArchivePayload, rules: RulesV1): ArchiveDetails {
  const sortedHands = [...payload.hands].sort((a, b) => a.handIndex - b.handIndex);
  const sortedLineups = [...payload.lineups].sort(
    (a, b) => a.effectiveFromHandIndex - b.effectiveFromHandIndex || a.lineupVersion - b.lineupVersion,
  );
  const nameById = buildNameMap(payload);
  const totalsQByPlayerId: Record<string, number> = {};
  const winsByPlayerId: Record<string, number> = {};
  const zimoByPlayerId: Record<string, number> = {};
  const discardByPlayerId: Record<string, number> = {};
  const handDisplays: ArchiveHandDisplay[] = [];
  let draws = 0;
  let dealerSeatIndex = 0;
  let dealerAdvanceCount = 0;

  for (const lineup of sortedLineups) {
    SEAT_KEYS.forEach((seatKey) => {
      const playerId = lineup.seats[seatKey];
      if (playerId) {
        totalsQByPlayerId[playerId] = totalsQByPlayerId[playerId] ?? 0;
      }
    });
  }

  for (const hand of sortedHands) {
    const lineup = getLineupForHand(sortedLineups, hand);
    const roundIndex = Math.floor(dealerAdvanceCount / 4) + 1;
    let deltasQ: number[] | null = null;
    let winnerName = hand.winnerPlayerId ? nameById.get(hand.winnerPlayerId) ?? hand.winnerPlayerId : '—';
    let discarderName = hand.discarderPlayerId ? nameById.get(hand.discarderPlayerId) ?? hand.discarderPlayerId : null;

    if (hand.type !== 'draw' && lineup && hand.winnerPlayerId) {
      const seatPlayerIds = getSeatPlayerIds(lineup);
      const winnerSeatIndex = seatPlayerIds.findIndex((playerId) => playerId === hand.winnerPlayerId);
      const discarderSeatIndex =
        hand.type === 'discard'
          ? seatPlayerIds.findIndex((playerId) => playerId === (hand.discarderPlayerId ?? null))
          : -1;

      if (winnerSeatIndex >= 0 && (hand.type !== 'discard' || discarderSeatIndex >= 0)) {
        const settlement = computeHkSettlement({
          rules,
          fan: hand.fan ?? rules.minFanToWin ?? 1,
          settlementType: hand.type === 'zimo' ? 'zimo' : 'discard',
          winnerSeatIndex,
          discarderSeatIndex: hand.type === 'discard' ? discarderSeatIndex : null,
        });
        deltasQ = settlement.deltasQ;
        winsByPlayerId[hand.winnerPlayerId] = (winsByPlayerId[hand.winnerPlayerId] ?? 0) + 1;
        if (hand.type === 'zimo') {
          zimoByPlayerId[hand.winnerPlayerId] = (zimoByPlayerId[hand.winnerPlayerId] ?? 0) + 1;
        }
        if (hand.type === 'discard' && hand.discarderPlayerId) {
          discardByPlayerId[hand.discarderPlayerId] = (discardByPlayerId[hand.discarderPlayerId] ?? 0) + 1;
        }

        SEAT_KEYS.forEach((seatKey, seatIndex) => {
          const playerId = lineup.seats[seatKey];
          if (!playerId) {
            return;
          }
          totalsQByPlayerId[playerId] = (totalsQByPlayerId[playerId] ?? 0) + settlement.deltasQ[seatIndex];
        });
      }
    } else if (hand.type === 'draw') {
      draws += 1;
    }

    handDisplays.push({
      hand,
      roundLabel: getCloudRoundLabel(roundIndex, dealerSeatIndex),
      windLabel: getCloudRoundLabel(roundIndex, dealerSeatIndex).slice(0, 2),
      winnerName,
      discarderName,
      deltasQ,
    });

    const nextDealerSeatIndex = getDealerSeatIndexAfterHand(dealerSeatIndex, hand, lineup);
    if (nextDealerSeatIndex !== dealerSeatIndex) {
      dealerAdvanceCount += 1;
    }
    dealerSeatIndex = nextDealerSeatIndex;
  }

  const rankedPlayers = Object.entries(totalsQByPlayerId)
    .map(([playerId, totalQ]) => ({
      playerId,
      name: nameById.get(playerId) ?? playerId,
      total: toAmountFromQ(totalQ),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'zh-Hant'));

  const roundIndex = Math.floor(dealerAdvanceCount / 4) + 1;
  return {
    summary: {
      roundLabel: getCloudRoundLabel(roundIndex, dealerSeatIndex),
      roundIndex,
      handCount: sortedHands.length,
      rankedPlayers,
    },
    stats: {
      draws,
      winsByPlayerId,
      zimoByPlayerId,
      discardByPlayerId,
      mostDiscarder: getMostCount(discardByPlayerId, nameById),
      mostZimo: getMostCount(zimoByPlayerId, nameById),
    },
    handDisplays,
  };
}

function getArchiveHandSummary(
  hand: HandLog,
  winnerName: string,
  discarderName: string | null,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  if (hand.type === 'draw') {
    return translateWithFallback(t, 'game.detail.hand.summary.draw', '流局');
  }
  const fanValue = hand.fan === null || hand.fan === undefined ? '—' : String(hand.fan);
  if (hand.type === 'zimo') {
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

function getVariantLabel(rules: RulesV1, t: (key: TranslationKey) => string): string {
  if (rules.mode === 'HK') {
    return `${translateWithFallback(t, 'newGame.mode.hk', '香港')} (HK)`;
  }
  if (rules.mode === 'TW') {
    return `${translateWithFallback(t, 'newGame.variant.twSimple', '台牌')} (TW)`;
  }
  return `${translateWithFallback(t, 'newGame.variant.pma', '跑馬仔')} (PMA)`;
}

function CloudArchiveDetailScreen({ route, navigation }: Props) {
  const { t } = useAppLanguage();
  const { roomId } = route.params;
  const [payload, setPayload] = useState<CloudArchivePayload | null>(null);
  const [error, setError] = useState('');
  const [handFilter, setHandFilter] = useState<HandFilter>('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const archive = await loadArchivedGame(roomId);
      if (!archive) {
        setError(translateWithFallback(t, 'cloudArchive.notFound', '找不到封存牌局。'));
        setPayload(null);
        return;
      }
      setPayload(archive);
      setError('');
    } catch (nextError) {
      setError(String(nextError));
      setPayload(null);
    }
  }, [roomId, t]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const rules = useMemo(
    () =>
      parseRules(
        typeof payload?.room.rulesSnapshot.serializedRules === 'string'
          ? payload.room.rulesSnapshot.serializedRules
          : null,
        'HK',
      ),
    [payload?.room.rulesSnapshot.serializedRules],
  );

  const details = useMemo(() => (payload ? buildArchiveDetails(payload, rules) : null), [payload, rules]);
  const summary = details?.summary ?? null;
  const stats = details?.stats ?? null;
  const currencySymbol = rules.currencySymbol || '';
  const filteredHandDisplays = useMemo(() => {
    const displays = details?.handDisplays ?? [];
    if (handFilter === 'wins') {
      return displays.filter((entry) => entry.hand.type !== 'draw');
    }
    if (handFilter === 'draws') {
      return displays.filter((entry) => entry.hand.type === 'draw');
    }
    return displays;
  }, [details?.handDisplays, handFilter]);
  const handSections = useMemo(() => {
    const sections = new Map<string, ArchiveHandDisplay[]>();
    filteredHandDisplays.forEach((entry) => {
      const list = sections.get(entry.windLabel) ?? [];
      list.push(entry);
      sections.set(entry.windLabel, list);
    });
    return Array.from(sections.entries()).map(([title, data]) => ({ title, data }));
  }, [filteredHandDisplays]);
  const filterOptions: Array<{ key: HandFilter; label: string }> = useMemo(
    () => [
      { key: 'all', label: translateWithFallback(t, 'game.detail.hands.filter.all', '全部') },
      { key: 'wins', label: translateWithFallback(t, 'game.detail.hands.filter.wins', '食糊') },
      { key: 'draws', label: translateWithFallback(t, 'game.detail.hands.filter.draws', '流局') },
    ],
    [t],
  );
  const handCountText = summary
    ? translateWithFallback(t, 'game.detail.header.handsPlayed', '已打 {count} 鋪', { count: summary.handCount })
    : '';

  const handleShare = useCallback(async () => {
    if (!payload || !summary) {
      return;
    }
    const rankingLines = summary.rankedPlayers.map(
      (player, index) => `${index + 1}. ${player.name} ${formatSignedMoney(player.total, currencySymbol)}`,
    );
    const message = [
      payload.room.title,
      `${summary.roundLabel} · ${handCountText}`,
      '',
      `${translateWithFallback(t, 'game.detail.players.title', '玩家排名')}:`,
      ...rankingLines,
    ].join('\n');
    await Share.share({ title: payload.room.title, message });
  }, [currencySymbol, handCountText, payload, summary, t]);

  if (!payload) {
    return (
      <ScreenContainer>
        <View style={styles.loadingWrap}>
          <Text style={error ? styles.errorText : styles.metaText}>
            {error || translateWithFallback(t, 'game.detail.loading', '載入中…')}
          </Text>
          {error ? (
            <AppButton
              label={translateWithFallback(t, 'common.back', '返回')}
              onPress={() => navigation.goBack()}
              variant="secondary"
            />
          ) : null}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
          <Text style={styles.headerTitle}>{payload.room.title}</Text>
          <Text style={styles.heroSubTitle}>{`${summary?.roundLabel ?? '—'} · ${handCountText}`}</Text>
          <Text style={styles.heroDateText}>
            {formatDate(payload.room.archiveReadyAt ?? payload.archivedFromCloudAt ?? payload.room.createdAt)}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>
            {translateWithFallback(t, 'game.detail.players.title', '玩家排名')}
          </Text>
          {summary?.rankedPlayers.length ? (
            summary.rankedPlayers.map((player, index) => (
              <View key={`rank-${player.playerId}`} style={styles.playerRow}>
                <Text style={styles.playerRank}>{getRankPrefix(index)}</Text>
                <View style={styles.playerMetaWrap}>
                  <Text style={styles.playerName}>{player.name}</Text>
                </View>
                <Text style={styles.playerTotal}>{formatSignedMoney(player.total, currencySymbol)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.metaText}>—</Text>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.rules.title', '規則摘要')}</Text>
          <Text style={styles.metaText}>
            {translateWithFallback(t, 'game.detail.rules.variant', '牌型')}：{getVariantLabel(rules, t)}
          </Text>
          <Text style={styles.metaText}>
            {translateWithFallback(t, 'game.detail.rules.currency', '幣別')}：{currencySymbol || rules.currencyCode}
          </Text>
          {typeof rules.minFanToWin === 'number' ? (
            <Text style={styles.metaText}>
              {translateWithFallback(t, 'game.detail.rules.minFan', '最低番數')}：{rules.minFanToWin}
            </Text>
          ) : null}
          {rules.mode === 'HK' && rules.hk ? (
            <>
              <Text style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.hkPreset', '計分模式')}：
                {rules.hk.scoringPreset === 'traditionalFan'
                  ? translateWithFallback(t, 'game.detail.rules.hkPreset.traditionalFan', '傳統番數')
                  : translateWithFallback(t, 'game.detail.rules.hkPreset.customTable', '自訂表')}
              </Text>
              <Text style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.hkGunMode', '銃制')}：
                {rules.hk.gunMode === 'halfGun'
                  ? translateWithFallback(t, 'game.detail.rules.hkGunMode.halfGun', '半銃')
                  : translateWithFallback(t, 'game.detail.rules.hkGunMode.fullGun', '全銃')}
              </Text>
              {rules.hk.scoringPreset === 'traditionalFan' ? (
                <Text style={styles.metaText}>
                  {translateWithFallback(t, 'game.detail.rules.hkStake', '注碼')}：
                  {rules.hk.stakePreset === 'FIVE_ONE'
                    ? translateWithFallback(t, 'game.detail.rules.hkStake.fiveOne', '五一')
                    : rules.hk.stakePreset === 'ONE_TWO'
                      ? translateWithFallback(t, 'game.detail.rules.hkStake.oneTwo', '一二蚊')
                      : translateWithFallback(t, 'game.detail.rules.hkStake.twoFiveChicken', '二五雞')}
                </Text>
              ) : (
                <Text style={styles.metaText}>
                  {translateWithFallback(t, 'game.detail.rules.custom.unitPerFanLabel', '每番金額')}：
                  {currencySymbol}
                  {rules.hk.unitPerFan ?? 1}
                </Text>
              )}
              <Text style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.hkCapFan', '爆棚')}：
                {rules.hk.capFan == null ? '∞' : rules.hk.capFan}
              </Text>
            </>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.stats.title', '統計')}</Text>
          <Text style={styles.statsHeadline}>
            {translateWithFallback(t, 'game.detail.stats.hands', '手數')}：{summary?.handCount ?? 0}
            {'  ·  '}
            {translateWithFallback(t, 'game.detail.stats.draws', '流局')}：{stats?.draws ?? 0}
          </Text>
          {summary?.rankedPlayers.map((player) => (
            <Text key={`stats-${player.playerId}`} style={styles.statsPlayerLine}>
              {player.name}：
              {translateWithFallback(t, 'game.detail.stats.wins', '食糊')} {stats?.winsByPlayerId[player.playerId] ?? 0}
              {' ｜ '}
              {translateWithFallback(t, 'game.detail.stats.zimo', '自摸')} {stats?.zimoByPlayerId[player.playerId] ?? 0}
              {' ｜ '}
              {translateWithFallback(t, 'game.detail.stats.discards', '出銃')} {stats?.discardByPlayerId[player.playerId] ?? 0}
            </Text>
          ))}
          <Text style={styles.statsHighlightLine}>
            {translateWithFallback(t, 'game.detail.stats.mostDiscard', '最多出銃')}：
            {formatHighlight(stats?.mostDiscarder ?? null)}
          </Text>
          <Text style={styles.statsHighlightLine}>
            {translateWithFallback(t, 'game.detail.stats.mostZimo', '最多自摸')}：
            {formatHighlight(stats?.mostZimo ?? null)}
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
                  onPress={() => {
                    setHandFilter(option.key);
                    setCollapsedSections({});
                  }}
                  style={[styles.filterChip, selected && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {handSections.length ? (
            handSections.map((section) => {
              const collapsed = collapsedSections[section.title] !== false;
              return (
                <View key={`section-${section.title}`} style={styles.handSection}>
                  <Pressable
                    onPress={() => {
                      setCollapsedSections((prev) => ({ ...prev, [section.title]: collapsed ? false : true }));
                    }}
                    style={styles.windSectionHeader}
                  >
                    <Text style={styles.windSectionTitle}>{section.title}</Text>
                    <Text style={styles.windSectionToggle}>{collapsed ? '＋' : '－'}</Text>
                  </Pressable>
                  {!collapsed
                    ? section.data.map((entry) => (
                        <View key={entry.hand.handId} style={styles.handRow}>
                          <View style={styles.handTopRow}>
                            <Text style={styles.handIndex}>#{entry.hand.handIndex + 1}</Text>
                            <Text style={styles.handRound}>{entry.roundLabel}</Text>
                          </View>
                          <View style={styles.handOutcomeRow}>
                            <Text style={styles.handOutcomeIcon}>
                              {entry.hand.type === 'draw' ? '⦿' : entry.hand.type === 'zimo' ? '◎' : '•'}
                            </Text>
                            <Text style={styles.handOutcomeText}>
                              {entry.hand.type === 'draw'
                                ? translateWithFallback(t, 'game.detail.hands.filter.draws', '流局')
                                : entry.hand.type === 'zimo'
                                  ? translateWithFallback(t, 'game.detail.stats.zimo', '自摸')
                                  : translateWithFallback(t, 'game.detail.stats.discards', '出銃')}
                            </Text>
                            {entry.hand.type === 'draw' && entry.hand.dealerAction ? (
                              <View style={styles.dealerActionBadge}>
                                <Text style={styles.dealerActionText}>
                                  {entry.hand.dealerAction === 'stick'
                                    ? translateWithFallback(t, 'game.detail.hand.dealerAction.stick', '番莊')
                                    : translateWithFallback(t, 'game.detail.hand.dealerAction.pass', '過莊')}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.handMetaText}>
                            {getArchiveHandSummary(entry.hand, entry.winnerName, entry.discarderName, t)}
                          </Text>
                          <View style={styles.deltaChipsRow}>
                            {SEAT_GLYPHS.map((seat, seatIndex) => (
                              <View key={`${entry.hand.handId}-delta-${seat}`} style={styles.deltaChip}>
                                <Text style={styles.deltaChipSeat}>{seat}</Text>
                                <Text style={styles.deltaChipValue}>
                                  {entry.deltasQ
                                    ? formatSignedMoney(toAmountFromQ(entry.deltasQ[seatIndex] ?? 0), currencySymbol)
                                    : '—'}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ))
                    : null}
                </View>
              );
            })
          ) : (
            <Text style={styles.metaText}>—</Text>
          )}
        </Card>

        <View style={styles.actionsWrap}>
          <AppButton
            label={translateWithFallback(t, 'game.detail.action.share', '分享')}
            onPress={() => {
              handleShare().catch((shareError) => console.error('[CloudArchiveDetail] share failed', shareError));
            }}
            disabled={!summary}
          />
        </View>
      </ScrollView>
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
  heroDateText: {
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  sectionTitle: {
    ...typography.subtitle,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
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
  metaText: {
    ...typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
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
  handSection: {
    marginBottom: theme.spacing.xs,
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
  handRow: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
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
  actionsWrap: {
    marginTop: theme.spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: theme.colors.danger,
  },
});

export default CloudArchiveDetailScreen;
