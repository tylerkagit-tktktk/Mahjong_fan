import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppText from '../../components/AppText';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import AppButton from '../../components/AppButton';
import Card from '../../components/Card';
import ScreenContainer from '../../components/ScreenContainer';
import { computeHkSettlement, toAmountFromQ } from '../../domain/hk/settlement';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { TranslationKey } from '../../i18n/types';
import { ArchiveSyncStatus, CloudArchivePayload, HandLog, RoomLineup, RoomMember, SeatKey } from '../../models/cloud';
import { parseRules, RulesV1 } from '../../models/rules';
import { RootStackParamList } from '../../navigation/types';
import { loadArchivedGame } from '../../services/cloud/archiveRepo';
import { ensureSession } from '../../services/cloud/authRepo';
import { deleteArchivedRoomAfterSync, getArchiveSyncStatus, subscribeMembers } from '../../services/cloud/roomRepo';
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
  sortLocale: string,
): { name: string; count: number } | null {
  const best = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(
      ([aId, aCount], [bId, bCount]) =>
        bCount - aCount || (nameById.get(aId) ?? aId).localeCompare(nameById.get(bId) ?? bId, sortLocale),
    )[0];
  if (!best) {
    return null;
  }
  const [playerId, count] = best;
  return { name: nameById.get(playerId) ?? playerId, count };
}

function buildArchiveDetails(payload: CloudArchivePayload, rules: RulesV1, sortLocale: string): ArchiveDetails {
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
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, sortLocale));

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
      mostDiscarder: getMostCount(discardByPlayerId, nameById, sortLocale),
      mostZimo: getMostCount(zimoByPlayerId, nameById, sortLocale),
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
  const { language, t } = useAppLanguage();
  const { roomId } = route.params;
  const [payload, setPayload] = useState<CloudArchivePayload | null>(null);
  const [error, setError] = useState('');
  const [handFilter, setHandFilter] = useState<HandFilter>('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [sessionUid, setSessionUid] = useState('');
  const [syncedMembers, setSyncedMembers] = useState<RoomMember[]>([]);
  const [receivedMemberSnapshot, setReceivedMemberSnapshot] = useState(false);
  const [deletingCloudRoom, setDeletingCloudRoom] = useState(false);
  const [cloudRoomDeleted, setCloudRoomDeleted] = useState(false);
  const [cloudCleanupError, setCloudCleanupError] = useState('');

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

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    ensureSession()
      .then((session) => {
        setSessionUid(session.uid);
        unsubscribe = subscribeMembers(roomId, (members) => {
          setSyncedMembers(members);
          setReceivedMemberSnapshot(true);
          if (members.length === 0) {
            setCloudRoomDeleted(true);
          }
        });
      })
      .catch(() => {});
    return () => unsubscribe?.();
  }, [roomId]);

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

  const details = useMemo(() => (payload ? buildArchiveDetails(payload, rules, language) : null), [language, payload, rules]);
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
  const syncMembers = receivedMemberSnapshot ? syncedMembers : payload?.members ?? [];
  const archiveSyncStatus: ArchiveSyncStatus | null = payload
    ? getArchiveSyncStatus(syncMembers, payload.archiveVersion)
    : null;
  const isHost = Boolean(payload && sessionUid && payload.room.hostUid === sessionUid);

  const confirmCloudDeletion = useCallback(() => {
    if (!payload || !isHost || !archiveSyncStatus?.isReadyForCloudDeletion || deletingCloudRoom) return;
    Alert.alert(
      translateWithFallback(t, 'cloudArchive.cleanup.confirmTitle', '刪除雲端房間？'),
      translateWithFallback(t, 'cloudArchive.cleanup.confirmBody', '所有成員已封存到本機。此操作會永久刪除 Firebase 的房間、成員、座位及牌局紀錄；本機紀錄會保留。'),
      [
        { text: translateWithFallback(t, 'game.detail.action.cancel', '取消'), style: 'cancel' },
        {
          text: translateWithFallback(t, 'cloudArchive.cleanup.delete', '刪除雲端資料'),
          style: 'destructive',
          onPress: () => {
            setDeletingCloudRoom(true);
            setCloudCleanupError('');
            deleteArchivedRoomAfterSync(payload.room.roomId, sessionUid)
              .then(() => setCloudRoomDeleted(true))
              .catch((nextError) => setCloudCleanupError(String(nextError)))
              .finally(() => setDeletingCloudRoom(false));
          },
        },
      ],
    );
  }, [archiveSyncStatus?.isReadyForCloudDeletion, deletingCloudRoom, isHost, payload, sessionUid, t]);

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
          <AppText style={error ? styles.errorText : styles.metaText}>
            {error || translateWithFallback(t, 'game.detail.loading', '載入中…')}
          </AppText>
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
            <AppText style={styles.heroLabel}>
              {translateWithFallback(t, 'game.detail.header.title', '對局總結')}
            </AppText>
            <View style={styles.statusBadge}>
              <AppText style={styles.statusBadgeText}>
                {translateWithFallback(t, 'game.detail.header.statusEnded', '已結束')}
              </AppText>
            </View>
          </View>
          <AppText style={styles.headerTitle}>{payload.room.title}</AppText>
          <AppText style={styles.heroSubTitle}>{`${summary?.roundLabel ?? '—'} · ${handCountText}`}</AppText>
          <AppText style={styles.heroDateText}>
            {formatDate(payload.room.archiveReadyAt ?? payload.archivedFromCloudAt ?? payload.room.createdAt)}
          </AppText>
        </Card>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>
            {translateWithFallback(t, 'game.detail.players.title', '玩家排名')}
          </AppText>
          {summary?.rankedPlayers.length ? (
            summary.rankedPlayers.map((player, index) => (
              <View key={`rank-${player.playerId}`} style={styles.playerRow}>
                <AppText style={styles.playerRank}>{getRankPrefix(index)}</AppText>
                <View style={styles.playerMetaWrap}>
                  <AppText style={styles.playerName}>{player.name}</AppText>
                </View>
                <AppText style={styles.playerTotal}>{formatSignedMoney(player.total, currencySymbol)}</AppText>
              </View>
            ))
          ) : (
            <AppText style={styles.metaText}>—</AppText>
          )}
        </Card>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.rules.title', '規則摘要')}</AppText>
          <AppText style={styles.metaText}>
            {translateWithFallback(t, 'game.detail.rules.variant', '牌型')}：{getVariantLabel(rules, t)}
          </AppText>
          <AppText style={styles.metaText}>
            {translateWithFallback(t, 'game.detail.rules.currency', '幣別')}：{currencySymbol || rules.currencyCode}
          </AppText>
          {typeof rules.minFanToWin === 'number' ? (
            <AppText style={styles.metaText}>
              {translateWithFallback(t, 'game.detail.rules.minFan', '最低番數')}：{rules.minFanToWin}
            </AppText>
          ) : null}
          {rules.mode === 'HK' && rules.hk ? (
            <>
              <AppText style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.hkPreset', '計分模式')}：
                {rules.hk.scoringPreset === 'traditionalFan'
                  ? translateWithFallback(t, 'game.detail.rules.hkPreset.traditionalFan', '傳統番數')
                  : translateWithFallback(t, 'game.detail.rules.hkPreset.customTable', '自訂表')}
              </AppText>
              <AppText style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.hkGunMode', '銃制')}：
                {rules.hk.gunMode === 'halfGun'
                  ? translateWithFallback(t, 'game.detail.rules.hkGunMode.halfGun', '半銃')
                  : translateWithFallback(t, 'game.detail.rules.hkGunMode.fullGun', '全銃')}
              </AppText>
              {rules.hk.scoringPreset === 'traditionalFan' ? (
                <AppText style={styles.metaText}>
                  {translateWithFallback(t, 'game.detail.rules.hkStake', '注碼')}：
                  {rules.hk.stakePreset === 'FIVE_ONE'
                    ? translateWithFallback(t, 'game.detail.rules.hkStake.fiveOne', '五一')
                    : rules.hk.stakePreset === 'ONE_TWO'
                      ? translateWithFallback(t, 'game.detail.rules.hkStake.oneTwo', '一二蚊')
                      : translateWithFallback(t, 'game.detail.rules.hkStake.twoFiveChicken', '二五雞')}
                </AppText>
              ) : (
                <AppText style={styles.metaText}>
                  {translateWithFallback(t, 'game.detail.rules.custom.unitPerFanLabel', '每番金額')}：
                  {currencySymbol}
                  {rules.hk.unitPerFan ?? 1}
                </AppText>
              )}
              <AppText style={styles.metaText}>
                {translateWithFallback(t, 'game.detail.rules.hkCapFan', '爆棚')}：
                {rules.hk.capFan == null ? '∞' : rules.hk.capFan}
              </AppText>
            </>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.stats.title', '統計')}</AppText>
          <AppText style={styles.statsHeadline}>
            {translateWithFallback(t, 'game.detail.stats.hands', '手數')}：{summary?.handCount ?? 0}
            {'  ·  '}
            {translateWithFallback(t, 'game.detail.stats.draws', '流局')}：{stats?.draws ?? 0}
          </AppText>
          {summary?.rankedPlayers.map((player) => (
            <AppText key={`stats-${player.playerId}`} style={styles.statsPlayerLine}>
              {player.name}：
              {translateWithFallback(t, 'game.detail.stats.wins', '食糊')} {stats?.winsByPlayerId[player.playerId] ?? 0}
              {' ｜ '}
              {translateWithFallback(t, 'game.detail.stats.zimo', '自摸')} {stats?.zimoByPlayerId[player.playerId] ?? 0}
              {' ｜ '}
              {translateWithFallback(t, 'game.detail.stats.discards', '出銃')} {stats?.discardByPlayerId[player.playerId] ?? 0}
            </AppText>
          ))}
          <AppText style={styles.statsHighlightLine}>
            {translateWithFallback(t, 'game.detail.stats.mostDiscard', '最多出銃')}：
            {formatHighlight(stats?.mostDiscarder ?? null)}
          </AppText>
          <AppText style={styles.statsHighlightLine}>
            {translateWithFallback(t, 'game.detail.stats.mostZimo', '最多自摸')}：
            {formatHighlight(stats?.mostZimo ?? null)}
          </AppText>
        </Card>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'cloudArchive.cleanup.title', '雲端清理')}</AppText>
          {cloudRoomDeleted ? (
            <AppText style={styles.cloudCleanupSuccess}>
              {translateWithFallback(t, 'cloudArchive.cleanup.done', '雲端房間已刪除，本機封存會繼續保留。')}
            </AppText>
          ) : (
            <>
              <AppText style={styles.metaText}>
                {translateWithFallback(t, 'cloudArchive.cleanup.syncProgress', '本機封存：{synced}/{total} 位成員已完成', {
                  synced: archiveSyncStatus?.syncedMemberCount ?? 0,
                  total: archiveSyncStatus?.requiredMemberCount ?? 0,
                })}
              </AppText>
              {archiveSyncStatus?.pendingMemberNames.length ? (
                <AppText style={styles.metaText}>
                  {translateWithFallback(t, 'cloudArchive.cleanup.waiting', '等待：{players}', {
                    players: archiveSyncStatus.pendingMemberNames.join('、'),
                  })}
                </AppText>
              ) : null}
              {isHost ? (
                <AppButton
                  label={translateWithFallback(t, 'cloudArchive.cleanup.delete', '刪除雲端資料')}
                  onPress={confirmCloudDeletion}
                  disabled={!archiveSyncStatus?.isReadyForCloudDeletion || deletingCloudRoom}
                  variant="secondary"
                  style={styles.cloudCleanupButton}
                />
              ) : (
                <AppText style={styles.metaText}>
                  {translateWithFallback(t, 'cloudArchive.cleanup.hostOnly', '全部成員完成後，主持人可刪除雲端資料。')}
                </AppText>
              )}
              {cloudCleanupError ? <AppText style={styles.errorText}>{cloudCleanupError}</AppText> : null}
            </>
          )}
        </Card>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.hands.title', '全部牌局')}</AppText>
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
                  <AppText style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{option.label}</AppText>
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
                    <AppText style={styles.windSectionTitle}>{section.title}</AppText>
                    <AppText style={styles.windSectionToggle}>{collapsed ? '＋' : '－'}</AppText>
                  </Pressable>
                  {!collapsed
                    ? section.data.map((entry) => (
                        <View key={entry.hand.handId} style={styles.handRow}>
                          <View style={styles.handTopRow}>
                            <AppText style={styles.handIndex}>#{entry.hand.handIndex + 1}</AppText>
                            <AppText style={styles.handRound}>{entry.roundLabel}</AppText>
                          </View>
                          <View style={styles.handOutcomeRow}>
                            <AppText style={styles.handOutcomeIcon}>
                              {entry.hand.type === 'draw' ? '⦿' : entry.hand.type === 'zimo' ? '◎' : '•'}
                            </AppText>
                            <AppText style={styles.handOutcomeText}>
                              {entry.hand.type === 'draw'
                                ? translateWithFallback(t, 'game.detail.hands.filter.draws', '流局')
                                : entry.hand.type === 'zimo'
                                  ? translateWithFallback(t, 'game.detail.stats.zimo', '自摸')
                                  : translateWithFallback(t, 'game.detail.stats.discards', '出銃')}
                            </AppText>
                            {entry.hand.type === 'draw' && entry.hand.dealerAction ? (
                              <View style={styles.dealerActionBadge}>
                                <AppText style={styles.dealerActionText}>
                                  {entry.hand.dealerAction === 'stick'
                                    ? translateWithFallback(t, 'game.detail.hand.dealerAction.stick', '番莊')
                                    : translateWithFallback(t, 'game.detail.hand.dealerAction.pass', '過莊')}
                                </AppText>
                              </View>
                            ) : null}
                          </View>
                          <AppText style={styles.handMetaText}>
                            {getArchiveHandSummary(entry.hand, entry.winnerName, entry.discarderName, t)}
                          </AppText>
                          <View style={styles.deltaChipsRow}>
                            {SEAT_GLYPHS.map((seat, seatIndex) => (
                              <View key={`${entry.hand.handId}-delta-${seat}`} style={styles.deltaChip}>
                                <AppText style={styles.deltaChipSeat}>{seat}</AppText>
                                <AppText style={styles.deltaChipValue}>
                                  {entry.deltasQ
                                    ? formatSignedMoney(toAmountFromQ(entry.deltasQ[seatIndex] ?? 0), currencySymbol)
                                    : '—'}
                                </AppText>
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
            <AppText style={styles.metaText}>—</AppText>
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
  cloudCleanupButton: {
    marginTop: theme.spacing.xs,
  },
  cloudCleanupSuccess: {
    ...typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  errorText: {
    ...typography.body,
    color: theme.colors.danger,
  },
});

export default CloudArchiveDetailScreen;
