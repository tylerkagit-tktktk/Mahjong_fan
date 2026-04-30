import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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

function buildArchiveSummary(payload: CloudArchivePayload, rules: RulesV1): ArchiveSummary {
  const sortedHands = [...payload.hands].sort((a, b) => a.handIndex - b.handIndex);
  const sortedLineups = [...payload.lineups].sort(
    (a, b) => a.effectiveFromHandIndex - b.effectiveFromHandIndex || a.lineupVersion - b.lineupVersion,
  );
  const nameById = buildNameMap(payload);
  const totalsQByPlayerId: Record<string, number> = {};
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

        SEAT_KEYS.forEach((seatKey, seatIndex) => {
          const playerId = lineup.seats[seatKey];
          if (!playerId) {
            return;
          }
          totalsQByPlayerId[playerId] = (totalsQByPlayerId[playerId] ?? 0) + settlement.deltasQ[seatIndex];
        });
      }
    }

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
    roundLabel: getCloudRoundLabel(roundIndex, dealerSeatIndex),
    roundIndex,
    handCount: sortedHands.length,
    rankedPlayers,
  };
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

  const summary = useMemo(() => (payload ? buildArchiveSummary(payload, rules) : null), [payload, rules]);
  const currencySymbol = rules.currencySymbol || '';
  const handCountText = summary
    ? translateWithFallback(t, 'game.detail.header.handsPlayed', '已打 {count} 鋪', { count: summary.handCount })
    : '';

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
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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
                <Text style={styles.playerName}>{player.name}</Text>
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
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  card: {
    gap: theme.spacing.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  heroLabel: {
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    borderRadius: 999,
    backgroundColor: '#E9E7E3',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  headerTitle: {
    ...typography.title,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.xs,
  },
  heroSubTitle: {
    ...typography.subtitle,
    color: theme.colors.textSecondary,
  },
  heroDateText: {
    ...typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 34,
  },
  playerRank: {
    ...typography.body,
    color: theme.colors.textSecondary,
    width: 40,
  },
  playerName: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  playerTotal: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
    textAlign: 'right',
  },
  metaText: {
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  errorText: {
    ...typography.body,
    color: theme.colors.danger,
  },
});

export default CloudArchiveDetailScreen;
