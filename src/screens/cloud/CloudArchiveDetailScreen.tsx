import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, SectionList, Share, StyleSheet, View } from 'react-native';
import AppButton from '../../components/AppButton';
import AppText from '../../components/AppText';
import Card from '../../components/Card';
import HeaderIconButton from '../../components/HeaderIconButton';
import ScreenContainer from '../../components/ScreenContainer';
import {
  buildCloudCanonicalResult,
  type CloudCanonicalProjection,
  type CloudResultHandProjection,
} from '../../domain/gameRecord/cloudResultProjection';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { TranslationKey } from '../../i18n/types';
import { translateWithFallback } from '../../i18n/translateWithFallback';
import { ArchiveSyncStatus, CloudArchivePayload, RoomMember } from '../../models/cloud';
import { RootStackParamList } from '../../navigation/types';
import { loadArchivedGame } from '../../services/cloud/archiveRepo';
import { ensureSession } from '../../services/cloud/authRepo';
import {
  deleteArchivedRoomAfterSync,
  getArchiveSyncStatus,
  subscribeMembers,
} from '../../services/cloud/roomRepo';
import { typography } from '../../styles/typography';
import theme from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CloudArchiveDetail'>;

type HandDisplay = {
  hand: CloudResultHandProjection;
  windLabel: string;
};

type HandSection = {
  title: string;
  data: HandDisplay[];
  isFirst: boolean;
};

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const dd = `${date.getDate()}`.padStart(2, '0');
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function formatSignedMoneyQ(valueQ: number, symbol: string): string {
  const rounded = Math.round(valueQ / 4);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '-'}${symbol}${Math.abs(rounded)}`;
}

function getRankPrefix(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}.`;
}

function formatLeader(
  projection: CloudCanonicalProjection,
  leader: { count: number; playerIds: readonly string[] } | null,
): string {
  if (!leader || leader.playerIds.length === 0) return '—';
  const nameById = new Map(projection.players.map((player) => [player.playerId, player.displayName]));
  return `${leader.playerIds.map((playerId) => nameById.get(playerId) ?? playerId).join(', ')} ×${leader.count}`;
}

function getHandSummary(
  hand: CloudResultHandProjection,
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
  const fan = hand.fan === null ? '—' : String(hand.fan);
  if (hand.outcome === 'zimo') {
    return translateWithFallback(t, 'game.detail.timeline.summary.zimo', '{name} 自摸 · {fan} 番', {
      name: winnerName,
      fan,
    });
  }
  return translateWithFallback(t, 'game.detail.timeline.summary.discard', '{winner} 食糊 · {loser} 出銃 · {fan} 番', {
    winner: winnerName,
    loser: discarderName ?? '—',
    fan,
  });
}

function buildShareRankingLines(projection: CloudCanonicalProjection): string[] {
  return projection.ranking.map(
    (player) => `${player.rank}. ${player.displayName} ${formatSignedMoneyQ(player.totalQ, projection.rules.currencySymbol)}`,
  );
}

function CloudArchiveDetailScreen({ route, navigation }: Props) {
  const { language, t } = useAppLanguage();
  const { roomId } = route.params;
  const [payload, setPayload] = useState<CloudArchivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sessionUid, setSessionUid] = useState('');
  const [syncedMembers, setSyncedMembers] = useState<RoomMember[]>([]);
  const [receivedMemberSnapshot, setReceivedMemberSnapshot] = useState(false);
  const [deletingCloudRoom, setDeletingCloudRoom] = useState(false);
  const [cloudRoomDeleted, setCloudRoomDeleted] = useState(false);
  const [cloudCleanupError, setCloudCleanupError] = useState('');
  const mountedRef = useRef(true);
  const sharingRef = useRef(false);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const archive = await loadArchivedGame(roomId);
      if (!archive) {
        setPayload(null);
        setLoadError(translateWithFallback(t, 'cloudArchive.notFound', '找不到封存牌局。'));
        return;
      }
      setPayload(archive);
      setHistoryExpanded(false);
      setRulesExpanded(false);
    } catch (error) {
      setPayload(null);
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [roomId, t]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    ensureSession()
      .then((session) => {
        if (!mountedRef.current) return;
        setSessionUid(session.uid);
        unsubscribe = subscribeMembers(roomId, (members) => {
          if (!mountedRef.current) return;
          setSyncedMembers(members);
          setReceivedMemberSnapshot(true);
          if (members.length === 0) setCloudRoomDeleted(true);
        });
      })
      .catch(() => {});
    return () => unsubscribe?.();
  }, [roomId]);

  const canonicalResult = useMemo(
    () => payload ? buildCloudCanonicalResult(payload) : null,
    [payload],
  );
  const projection = canonicalResult?.canonicalValid ? canonicalResult.projection : null;
  const nameById = useMemo(
    () => new Map((projection?.players ?? []).map((player) => [player.playerId, player.displayName])),
    [projection?.players],
  );
  const handDisplayList = useMemo<HandDisplay[]>(
    () => (projection?.hands ?? [])
      .slice()
      .sort((left, right) => left.trace.canonicalHandIndex - right.trace.canonicalHandIndex)
      .map((hand) => ({ hand, windLabel: `${hand.currentRound.wind}風` })),
    [projection?.hands],
  );
  const handSections = useMemo<HandSection[]>(() => {
    const sections = new Map<string, HandDisplay[]>();
    handDisplayList.forEach((entry) => {
      const data = sections.get(entry.windLabel) ?? [];
      data.push(entry);
      sections.set(entry.windLabel, data);
    });
    return [...sections.entries()].map(([title, data], index) => ({ title, data, isFirst: index === 0 }));
  }, [handDisplayList]);

  const handCount = projection?.statistics.handsCount ?? 0;
  const historyCountLabel = translateWithFallback(
    t,
    handCount === 1 ? 'game.detail.hands.countOne' : 'game.detail.hands.count',
    '{count} 鋪',
    { count: handCount },
  );
  const historyTitle = translateWithFallback(t, 'game.detail.hands.title', '牌局紀錄');
  const historyAccessibilityLabel = `${historyTitle}${language === 'en' ? ', ' : '，'}${historyCountLabel}`;
  const zimoHighlight = projection ? formatLeader(projection, projection.statistics.zimoLeaders) : '—';
  const discardHighlight = projection ? formatLeader(projection, projection.statistics.discardLeaders) : '—';

  const localizedScoringPreset = useMemo(() => {
    if (!projection) return '—';
    return projection.rules.scoringPreset === 'traditionalFan'
      ? translateWithFallback(t, 'game.detail.rules.hkPreset.traditionalFan', '傳統番數')
      : translateWithFallback(t, 'game.detail.rules.mode.custom', '自訂番數（價錢表）');
  }, [projection, t]);
  const localizedGunMode = useMemo(() => {
    if (!projection) return '—';
    return projection.rules.gunMode === 'fullGun'
      ? translateWithFallback(t, 'game.detail.rules.hkGunMode.fullGun', '全銃')
      : translateWithFallback(t, 'game.detail.rules.hkGunMode.halfGun', '半銃');
  }, [projection, t]);
  const localizedStakePreset = useMemo(() => {
    if (!projection) return '—';
    if (projection.rules.stakePreset === 'FIVE_ONE') {
      return translateWithFallback(t, 'game.detail.rules.hkStake.fiveOne', '五一');
    }
    if (projection.rules.stakePreset === 'ONE_TWO') {
      return translateWithFallback(t, 'game.detail.rules.hkStake.oneTwo', '一二蚊');
    }
    return translateWithFallback(t, 'game.detail.rules.hkStake.twoFiveChicken', '二五雞');
  }, [projection, t]);

  const completionDate = payload
    ? formatDate(payload.room.archiveReadyAt ?? payload.archivedFromCloudAt)
    : '—';
  const syncMembers = receivedMemberSnapshot ? syncedMembers : payload?.members ?? [];
  const archiveSyncStatus: ArchiveSyncStatus | null = payload
    ? getArchiveSyncStatus(syncMembers, payload.archiveVersion)
    : null;
  const isHost = Boolean(payload && sessionUid && payload.room.hostUid === sessionUid);

  const confirmCloudDeletion = useCallback(() => {
    if (!payload || !isHost || !archiveSyncStatus?.isReadyForCloudDeletion || deletingCloudRoom) return;
    Alert.alert(
      translateWithFallback(t, 'cloudArchive.cleanup.confirmTitle', '刪除雲端房間？'),
      translateWithFallback(t, 'cloudArchive.cleanup.confirmBody', '所有成員已封存到本機。此操作會永久刪除雲端房間；本機紀錄會保留。'),
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
              .catch((error) => setCloudCleanupError(error instanceof Error ? error.message : String(error)))
              .finally(() => setDeletingCloudRoom(false));
          },
        },
      ],
    );
  }, [archiveSyncStatus?.isReadyForCloudDeletion, deletingCloudRoom, isHost, payload, sessionUid, t]);

  const handleShare = useCallback(async () => {
    if (!payload || !projection || sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    const message = [
      `${payload.room.title} — ${completionDate}`,
      '',
      translateWithFallback(t, 'game.detail.share.resultTitle', '牌局戰果'),
      ...buildShareRankingLines(projection),
      '',
      `${translateWithFallback(t, 'game.detail.header.handsPlayed', '已打 {count} 鋪', { count: handCount })} · ${translateWithFallback(t, 'game.detail.stats.draws', '流局')} ${projection.statistics.draws}`,
      `${translateWithFallback(t, 'game.detail.highlights.topZimo', '最多自摸')}：${zimoHighlight}`,
      `${translateWithFallback(t, 'game.detail.highlights.topDiscard', '最多出銃')}：${discardHighlight}`,
    ].join('\n');
    try {
      await Share.share({ title: payload.room.title, message });
    } catch {
      Alert.alert(
        translateWithFallback(t, 'game.detail.share.failedTitle', '未能分享結果'),
        translateWithFallback(t, 'game.detail.share.failedMessage', '請稍後再試。'),
      );
    } finally {
      sharingRef.current = false;
      if (mountedRef.current) setSharing(false);
    }
  }, [completionDate, discardHighlight, handCount, payload, projection, t, zimoHighlight]);

  const shareAccessibilityLabel = translateWithFallback(t, 'game.detail.action.shareResult', '分享戰果');
  const renderHeaderShare = useCallback(() => (
    <HeaderIconButton
      testID="cloud-archive-header-share"
      icon="↥"
      onPress={() => { handleShare().catch(() => {}); }}
      accessibilityLabel={shareAccessibilityLabel}
      disabled={!projection || sharing}
      fontSize={24}
    />
  ), [handleShare, projection, shareAccessibilityLabel, sharing]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: renderHeaderShare,
      unstable_headerRightItems: () => [{
        type: 'button',
        label: shareAccessibilityLabel,
        accessibilityLabel: shareAccessibilityLabel,
        icon: { type: 'sfSymbol', name: 'square.and.arrow.up' },
        variant: 'plain',
        hidesSharedBackground: true,
        sharesBackground: false,
        disabled: !projection || sharing,
        onPress: () => { handleShare().catch(() => {}); },
      }],
    });
  }, [handleShare, navigation, projection, renderHeaderShare, shareAccessibilityLabel, sharing]);

  const renderHandItem = useCallback(
    ({ item, index, section }: { item: HandDisplay; index: number; section: HandSection }) => {
      if (!projection) return null;
      const hand = item.hand;
      const winnerName = hand.winnerPlayerId ? nameById.get(hand.winnerPlayerId) ?? '—' : '—';
      const discarderName = hand.discarderPlayerId ? nameById.get(hand.discarderPlayerId) ?? '—' : null;
      const summary = getHandSummary(hand, winnerName, discarderName, t);
      const handNumber = translateWithFallback(t, 'game.detail.timeline.handNumber', '第 {count} 鋪', {
        count: hand.trace.canonicalHandIndex + 1,
      });
      const accessibilityLabel = translateWithFallback(t, 'game.detail.accessibility.timeline', '{round}，{summary}', {
        round: hand.currentRound.labelZh,
        summary,
      });
      return (
        <View
          testID={`cloud-hand-row-${hand.trace.sourceHandId}`}
          accessible
          accessibilityLabel={accessibilityLabel}
          style={[styles.handRow, index === section.data.length - 1 && styles.handRowLast]}
        >
          <View style={styles.handTopRow}>
            <AppText style={styles.handRound}>{hand.currentRound.labelZh}</AppText>
            <AppText testID={`cloud-hand-number-${hand.trace.sourceHandId}`} style={styles.handIndex}>{handNumber}</AppText>
          </View>
          <View testID={`cloud-hand-event-row-${hand.trace.sourceHandId}`} style={styles.handEventRow}>
            <AppText style={styles.handSummary}>{summary}</AppText>
            {hand.winnerGainQ !== null ? (
              <AppText testID={`cloud-hand-gain-${hand.trace.sourceHandId}`} style={styles.handGain}>
                {formatSignedMoneyQ(hand.winnerGainQ, projection.rules.currencySymbol)}
              </AppText>
            ) : null}
          </View>
        </View>
      );
    },
    [nameById, projection, t],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: HandSection }) => (
      <View
        testID={`cloud-wind-section-${section.title}`}
        style={[styles.windSectionHeader, !section.isFirst && styles.windSectionHeaderSpaced]}
      >
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

  if (!payload) {
    return (
      <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
        <View style={styles.loadingWrap}>
          <AppText style={styles.errorText}>{loadError || translateWithFallback(t, 'errors.loadGame', '載入對局失敗')}</AppText>
          <AppButton label={translateWithFallback(t, 'common.back', '返回')} onPress={() => navigation.goBack()} variant="secondary" />
        </View>
      </ScreenContainer>
    );
  }

  if (!projection) {
    return (
      <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
        <View style={styles.loadingWrap}>
          <AppText style={styles.unavailableTitle}>
            {translateWithFallback(t, 'cloudArchive.resultUnavailable.title', '暫時無法確認牌局結果')}
          </AppText>
          <AppText style={styles.unavailableBody}>
            {translateWithFallback(t, 'cloudArchive.resultUnavailable.body', '部分牌局資料不完整，為避免顯示錯誤分數，暫時未能產生可靠結果。')}
          </AppText>
          <AppButton label={translateWithFallback(t, 'common.back', '返回')} onPress={() => navigation.goBack()} variant="secondary" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.container} includeTopInset={false} horizontalPadding={0}>
      <SectionList
        sections={historyExpanded ? handSections : []}
        keyExtractor={(item) => item.hand.trace.canonicalHandId}
        renderItem={renderHandItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={(
          <>
            <Card style={styles.card}>
              <View style={styles.heroTopRow}>
                <AppText style={styles.heroLabel}>{translateWithFallback(t, 'game.detail.header.title', '對局總結')}</AppText>
                <View style={styles.statusBadge}>
                  <AppText style={styles.statusBadgeText}>{translateWithFallback(t, 'game.detail.header.statusEnded', '已結束')}</AppText>
                </View>
              </View>
              <AppText style={styles.headerTitle}>{payload.room.title}</AppText>
              <AppText style={styles.heroSubTitle}>
                {`${projection.finalRound.nextRoundLabelZh} · ${translateWithFallback(t, 'game.detail.header.handsPlayed', '已打 {count} 鋪', { count: handCount })}`}
              </AppText>
              <AppText style={styles.heroDateText}>{completionDate}</AppText>
            </Card>

            <Card style={styles.card}>
              <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.players.title', '玩家排名')}</AppText>
              {projection.ranking.map((player) => (
                <View
                  key={`rank-${player.playerId}`}
                  accessible
                  accessibilityLabel={translateWithFallback(t, 'game.detail.accessibility.rank', '第 {rank} 名，{name}，最終 {amount}', {
                    rank: player.rank,
                    name: player.displayName,
                    amount: formatSignedMoneyQ(player.totalQ, projection.rules.currencySymbol),
                  })}
                  style={styles.playerRow}
                >
                  <AppText style={styles.playerRank}>{getRankPrefix(player.rank)}</AppText>
                  <View style={styles.playerMetaWrap}>
                    <AppText numberOfLines={1} ellipsizeMode="tail" style={styles.playerName}>{player.displayName}</AppText>
                  </View>
                  <AppText style={styles.playerTotal}>{formatSignedMoneyQ(player.totalQ, projection.rules.currencySymbol)}</AppText>
                </View>
              ))}
            </Card>

            <Card style={styles.card}>
              <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'game.detail.highlights.title', '牌局統計')}</AppText>
              <View style={styles.highlightsGrid}>
                <View style={styles.highlightCell}>
                  <AppText style={styles.highlightLabel}>{translateWithFallback(t, 'game.detail.stats.hands', '局數')}</AppText>
                  <AppText style={styles.highlightValue}>{handCount}</AppText>
                </View>
                <View style={styles.highlightCell}>
                  <AppText style={styles.highlightLabel}>{translateWithFallback(t, 'game.detail.stats.draws', '流局')}</AppText>
                  <AppText style={styles.highlightValue}>{projection.statistics.draws}</AppText>
                </View>
                <View style={styles.highlightCell}>
                  <AppText style={styles.highlightLabel}>{translateWithFallback(t, 'game.detail.highlights.topZimo', '最多自摸')}</AppText>
                  <AppText style={styles.highlightName}>{zimoHighlight}</AppText>
                </View>
                <View style={styles.highlightCell}>
                  <AppText style={styles.highlightLabel}>{translateWithFallback(t, 'game.detail.highlights.topDiscard', '最多出銃')}</AppText>
                  <AppText style={styles.highlightName}>{discardHighlight}</AppText>
                </View>
              </View>
            </Card>

            <Pressable
              testID="cloud-history-toggle"
              accessibilityRole="button"
              accessibilityLabel={historyAccessibilityLabel}
              accessibilityState={{ expanded: historyExpanded, disabled: handCount === 0 }}
              disabled={handCount === 0}
              onPress={() => setHistoryExpanded((expanded) => !expanded)}
              style={styles.historyDisclosure}
            >
              <AppText style={styles.historyTitle}>{`${historyTitle} · ${historyCountLabel}`}</AppText>
              {handCount > 0 ? <AppText style={styles.historyToggle}>{historyExpanded ? '－' : '＋'}</AppText> : null}
            </Pressable>
          </>
        )}
        ListFooterComponent={(
          <>
            <Card style={styles.rulesCard}>
              <Pressable
                testID="cloud-rules-toggle"
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
                  <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.variant', '牌型')}：{translateWithFallback(t, 'newGame.variant.hk', '香港牌')}</AppText>
                  <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.currency', '幣別')}：{projection.rules.currencySymbol || '—'}</AppText>
                  <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.minFan', '最低番數')}：{projection.rules.minFanToWin}</AppText>
                  <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.hkPreset', '計分模式')}：{localizedScoringPreset}</AppText>
                  {projection.rules.scoringPreset === 'traditionalFan' ? (
                    <>
                      <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.hkGunMode', '銃制')}：{localizedGunMode}</AppText>
                      <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.hkStake', '注碼')}：{localizedStakePreset}</AppText>
                    </>
                  ) : (
                    <>
                      <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.custom.unitPerFanLabel', '每番金額')}：{projection.rules.currencySymbol}{projection.rules.unitPerFan}</AppText>
                      <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.custom.multiplierSummary', '自摸：3 份；出銃：2 份')}</AppText>
                    </>
                  )}
                  <AppText style={styles.metaText}>{translateWithFallback(t, 'game.detail.rules.hkCapFan', '爆棚')}：{projection.rules.capFan ?? '∞'}</AppText>
                </View>
              ) : null}
            </Card>

            <Card style={styles.cleanupCard}>
              <AppText style={styles.sectionTitle}>{translateWithFallback(t, 'cloudArchive.cleanup.title', '雲端清理')}</AppText>
              {cloudRoomDeleted ? (
                <AppText style={styles.cloudCleanupSuccess}>{translateWithFallback(t, 'cloudArchive.cleanup.done', '雲端房間已刪除，本機封存會繼續保留。')}</AppText>
              ) : (
                <>
                  <AppText style={styles.metaText}>
                    {translateWithFallback(t, 'cloudArchive.cleanup.syncProgress', '本機封存：{synced}/{total} 位成員已完成', {
                      synced: archiveSyncStatus?.syncedMemberCount ?? 0,
                      total: archiveSyncStatus?.requiredMemberCount ?? 0,
                    })}
                  </AppText>
                  {archiveSyncStatus?.pendingMemberNames.length ? (
                    <AppText style={styles.metaText}>{translateWithFallback(t, 'cloudArchive.cleanup.waiting', '等待：{players}', { players: archiveSyncStatus.pendingMemberNames.join('、') })}</AppText>
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
                    <AppText style={styles.metaText}>{translateWithFallback(t, 'cloudArchive.cleanup.hostOnly', '全部成員完成後，主持人可刪除雲端資料。')}</AppText>
                  )}
                  {cloudCleanupError ? <AppText style={styles.errorText}>{cloudCleanupError}</AppText> : null}
                </>
              )}
            </Card>
          </>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  card: { marginBottom: theme.spacing.md },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  heroLabel: { ...typography.caption, color: theme.colors.textSecondary, fontWeight: '600', letterSpacing: 0.3 },
  statusBadge: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(70,63,56,0.12)' },
  statusBadgeText: { ...typography.caption, fontWeight: '600', color: theme.colors.textSecondary },
  headerTitle: { ...typography.title, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
  heroSubTitle: { ...typography.body, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  heroDateText: { ...typography.body, color: theme.colors.textSecondary },
  sectionTitle: { ...typography.subtitle, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
  metaText: { ...typography.body, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  playerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm },
  playerRank: { width: 34, ...typography.body, color: theme.colors.textSecondary },
  playerMetaWrap: { flex: 1, minWidth: 0 },
  playerName: { ...typography.subtitle, color: theme.colors.textPrimary, fontWeight: '600' },
  playerTotal: { ...typography.subtitle, color: theme.colors.textPrimary, fontWeight: '700', flexShrink: 0, marginLeft: theme.spacing.sm, fontVariant: ['tabular-nums'] },
  highlightsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -theme.spacing.xs },
  highlightCell: { width: '50%', paddingHorizontal: theme.spacing.xs, paddingVertical: theme.spacing.sm },
  highlightLabel: { ...typography.caption, color: theme.colors.textSecondary, marginBottom: 2 },
  highlightValue: { ...typography.subtitle, color: theme.colors.textPrimary, fontWeight: '700', fontVariant: ['tabular-nums'] },
  highlightName: { ...typography.body, color: theme.colors.textPrimary, fontWeight: '600' },
  historyDisclosure: { paddingVertical: theme.spacing.sm, paddingRight: theme.spacing.sm, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyTitle: { ...typography.subtitle, color: theme.colors.textPrimary, fontWeight: '700', flex: 1, minWidth: 0, marginRight: theme.spacing.sm },
  historyToggle: { ...typography.body, color: theme.colors.textSecondary, fontWeight: '600', flexShrink: 0, minWidth: 24, textAlign: 'center' },
  handRow: { paddingTop: theme.spacing.sm, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  handRowLast: { borderBottomWidth: 0 },
  windSectionHeader: { paddingTop: theme.spacing.xs, paddingBottom: 2 },
  windSectionHeaderSpaced: { paddingTop: theme.spacing.lg },
  windSectionTitle: { ...typography.subtitle, fontWeight: '700', color: theme.colors.textPrimary },
  handTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  handIndex: { ...typography.caption, color: theme.colors.textSecondary, fontWeight: '400', flexShrink: 0, marginLeft: theme.spacing.sm },
  handRound: { ...typography.body, color: theme.colors.textPrimary, fontWeight: '600', flex: 1, minWidth: 0 },
  handEventRow: { marginTop: 4, flexDirection: 'row', alignItems: 'flex-start' },
  handSummary: { ...typography.body, color: theme.colors.textPrimary, flex: 1, flexShrink: 1, minWidth: 0 },
  handGain: { ...typography.body, color: theme.colors.textPrimary, fontWeight: '700', flexShrink: 0, marginLeft: theme.spacing.sm, textAlign: 'right', fontVariant: ['tabular-nums'] },
  rulesCard: { marginTop: theme.spacing.md, marginBottom: theme.spacing.md },
  rulesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rulesToggle: { ...typography.body, color: theme.colors.textSecondary, fontWeight: '600', marginBottom: theme.spacing.sm, minWidth: 24, textAlign: 'center' },
  cleanupCard: { marginBottom: theme.spacing.md },
  cloudCleanupButton: { marginTop: theme.spacing.xs },
  cloudCleanupSuccess: { ...typography.body, color: theme.colors.primary, fontWeight: '600' },
  unavailableTitle: { ...typography.title, color: theme.colors.textPrimary, fontWeight: '700', textAlign: 'center', marginBottom: theme.spacing.sm },
  unavailableBody: { ...typography.body, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: theme.spacing.lg, maxWidth: 360 },
  errorText: { ...typography.body, color: theme.colors.danger, marginBottom: theme.spacing.md },
});

export default CloudArchiveDetailScreen;
