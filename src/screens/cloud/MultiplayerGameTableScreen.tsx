import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppText from '../../components/AppText';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, LayoutChangeEvent, Modal, Pressable, ScrollView, StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppButton from '../../components/AppButton';
import Card from '../../components/Card';
import PillGroup from '../../components/PillGroup';
import ScreenContainer from '../../components/ScreenContainer';
import { CurrencyCode } from '../../models/currency';
import { getCurrencyMeta } from '../../models/currency';
import { HandLog, ResolvedRoomPlayer, Room, RoomLineup, SeatKey } from '../../models/cloud';
import { parseRules } from '../../models/rules';
import { RootStackParamList } from '../../navigation/types';
import { typography } from '../../styles/typography';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { archiveRoomToLocal } from '../../services/cloud/archiveRepo';
import { ensureSession } from '../../services/cloud/authRepo';
import { listHands, submitHand } from '../../services/cloud/handRepo';
import { computeHkSettlement, toAmountFromQ } from '../../domain/hk/settlement';
import { formatSeatLabel } from '../gameTable/seatMapping';
import {
  endRoom,
  getRoom,
  listLineups,
  subscribeActiveLineup,
  subscribeRoom,
  subscribeRoomPlayers,
} from '../../services/cloud/roomRepo';
import theme from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MultiplayerGameTable'>;

const SEAT_KEYS: SeatKey[] = ['0', '1', '2', '3'];
const SEAT_INDEX_ORDER = [2, 1, 0, 3] as const;
const SEAT_GLYPHS = ['東', '南', '西', '北'] as const;
const SEAT_COLORS = ['#1A73E8', '#D93025', '#188038', '#5F6368'] as const;
type DrawDealerAction = 'stick' | 'pass';
type CloudRoundState = {
  dealerSeatIndex: number;
  dealerAdvanceCount: number;
  handCount: number;
};

function formatMessage(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replace(`{${key}}`, String(value)), template);
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

function getCloudRoundLabel(roundIndex: number, dealerSeatIndex: number): string {
  const roundWind = SEAT_GLYPHS[(roundIndex - 1) % SEAT_GLYPHS.length] ?? '東';
  const dealerWind = SEAT_GLYPHS[dealerSeatIndex] ?? '東';
  return `${roundWind}風${dealerWind}局`;
}

function MultiplayerGameTableScreen({ route, navigation }: Props) {
  const { t } = useAppLanguage();
  const { roomId } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [uid, setUid] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [roomVersion, setRoomVersion] = useState(1);
  const [lineup, setLineup] = useState<RoomLineup | null>(null);
  const [players, setPlayers] = useState<ResolvedRoomPlayer[]>([]);
  const [notice, setNotice] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [selectedWinnerId, setSelectedWinnerId] = useState('');
  const [selectedDiscarderId, setSelectedDiscarderId] = useState('');
  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [settlementType, setSettlementType] = useState<'zimo' | 'discard'>('discard');
  const [fanInput, setFanInput] = useState('3');
  const [totalsQByPlayerId, setTotalsQByPlayerId] = useState<Record<string, number>>({});
  const [dealerSeatIndex, setDealerSeatIndex] = useState(0);
  const [roundState, setRoundState] = useState<CloudRoundState>({
    dealerSeatIndex: 0,
    dealerAdvanceCount: 0,
    handCount: 0,
  });
  const [tableLayout, setTableLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const archivedRoomRef = useRef<string | null>(null);
  const endingRoomRef = useRef<string | null>(null);

  const refreshHands = useCallback(async () => {
    const nextRoom = await getRoom(roomId);
    if (nextRoom) {
      setRoom(nextRoom);
      setRoomVersion(nextRoom.currentVersion);
    }
  }, [roomId]);

  useEffect(() => {
    let unSubPlayers: (() => void) | null = null;
    let unSubLineup: (() => void) | null = null;
    let unSubRoom: (() => void) | null = null;

    const loadPromise = (async () => {
      const session = await ensureSession('google');
      setUid(session.uid);
      unSubPlayers = subscribeRoomPlayers(roomId, session.uid, setPlayers);
      unSubLineup = subscribeActiveLineup(roomId, setLineup);
      unSubRoom = subscribeRoom(roomId, (nextRoom) => {
        setRoom(nextRoom);
        setRoomVersion(nextRoom?.currentVersion ?? 1);
      });
      await refreshHands();
    })();

    loadPromise.catch(() => {});

    return () => {
      unSubPlayers?.();
      unSubLineup?.();
      unSubRoom?.();
    };
  }, [refreshHands, roomId]);

  useEffect(() => {
    if (!uid || !room || archiving || endingRoomRef.current === room.roomId) {
      return;
    }
    if (room.status !== 'ended' && room.status !== 'archived') {
      return;
    }
    if (archivedRoomRef.current === room.roomId) {
      return;
    }

    setArchiving(true);
    archiveRoomToLocal(room.roomId, uid)
      .then((summary) => {
        archivedRoomRef.current = room.roomId;
        setNotice(
          formatMessage(t('multiplayer.notice.archiveReady'), {
            handCount: summary.handCount,
          }),
        );
        navigation.replace('CloudArchiveDetail', { roomId: room.roomId });
      })
      .catch((error) => {
        setNotice(t('multiplayer.notice.archiveFailed', { message: String(error) }));
      })
      .finally(() => {
        setArchiving(false);
      });
  }, [archiving, navigation, room, t, uid]);

  const playerById = useMemo(() => {
    const next = new Map<string, ResolvedRoomPlayer>();
    for (const player of players) {
      next.set(player.playerId, player);
    }
    return next;
  }, [players]);

  const activePlayers = useMemo(
    () =>
      SEAT_KEYS.map((seatKey) => {
        const playerId = lineup?.seats[seatKey];
        return playerId ? playerById.get(playerId) ?? null : null;
      }).filter((player): player is ResolvedRoomPlayer => Boolean(player)),
    [lineup, playerById],
  );

  useEffect(() => {
    if (!activePlayers.length) {
      setSelectedWinnerId('');
      setSelectedDiscarderId('');
      return;
    }
    if (!selectedWinnerId || !activePlayers.some((player) => player.playerId === selectedWinnerId)) {
      setSelectedWinnerId(activePlayers[0].playerId);
    }
    if (!selectedDiscarderId || !activePlayers.some((player) => player.playerId === selectedDiscarderId)) {
      setSelectedDiscarderId(activePlayers[activePlayers.length - 1].playerId);
    }
  }, [activePlayers, selectedDiscarderId, selectedWinnerId]);

  const canSubmit = useMemo(() => {
    if (!lineup || room?.status === 'ended' || room?.status === 'archived') {
      return false;
    }
    return SEAT_KEYS.some((seatKey) => lineup.seats[seatKey] === uid);
  }, [lineup, room?.status, uid]);

  const seatLabels = useMemo(
    () => [t('seat.east'), t('seat.south'), t('seat.west'), t('seat.north')],
    [t],
  );
  const gameTitle = useMemo(() => room?.title?.trim() || t('nav.dashboard'), [room?.title, t]);

  const seatPanels = useMemo(
    () =>
      SEAT_KEYS.map((seatKey, index) => {
        const playerId = lineup?.seats[seatKey] ?? null;
        const player = playerId ? playerById.get(playerId) ?? null : null;
        return {
          seatIndex: index,
          seatLabel: seatLabels[index],
          player,
          displayName: player?.displayName ?? t('multiplayer.lineup.emptySeat'),
          amount: player ? toAmountFromQ(totalsQByPlayerId[player.playerId] ?? 0) : 0,
          isSelf: Boolean(player?.isSelf),
          isHost: Boolean(player?.isHost),
          isTemporary: player?.kind === 'temporary',
          occupied: Boolean(player),
          isDealer: index === dealerSeatIndex,
        };
      }),
    [dealerSeatIndex, lineup, playerById, seatLabels, t, totalsQByPlayerId],
  );

  const tableSize = Math.min(width * 0.56, 258);
  const tableVerticalOffset = 0;
  const panelWidth = Math.min(width * 0.285, 148);
  const panelHeight = 92;
  const roundIndex = Math.floor(roundState.dealerAdvanceCount / 4) + 1;
  const roundLabel = getCloudRoundLabel(roundIndex, roundState.dealerSeatIndex);
  const handCountLabel =
    roundState.handCount > 0
      ? t('gameTable.handCount.started').replace('{count}', String(roundState.handCount))
      : t('gameTable.handCount.notStarted');
  const roomRules = useMemo(
    () =>
      parseRules(
        typeof room?.rulesSnapshot.serializedRules === 'string' ? room.rulesSnapshot.serializedRules : null,
        'HK',
      ),
    [room?.rulesSnapshot.serializedRules],
  );
  const rulesSummaryMeta = useMemo(() => {
    if (roomRules.mode !== 'HK' || !roomRules.hk) {
      return null;
    }

    const isHkTraditional = roomRules.hk.scoringPreset === 'traditionalFan';
    const scoringLabel = isHkTraditional ? t('newGame.hkPreset.traditional') : t('newGame.hkPreset.custom');
    const gunLabel = roomRules.hk.gunMode === 'halfGun' ? t('newGame.hkGunMode.half') : t('newGame.hkGunMode.full');
    const stakeLabelMap = {
      TWO_FIVE_CHICKEN: t('newGame.hkStakePreset.twoFiveChicken'),
      FIVE_ONE: t('newGame.hkStakePreset.fiveOne'),
      ONE_TWO: t('newGame.hkStakePreset.oneTwo'),
    } as const;
    const stakeLabel = stakeLabelMap[roomRules.hk.stakePreset] ?? roomRules.hk.stakePreset;
    const unitPerFanLabel = t('game.detail.rules.custom.unitPerFan').replace('{amount}', String(roomRules.hk.unitPerFan));
    return { scoringLabel, gunLabel, stakeLabel, unitPerFanLabel, isHkTraditional };
  }, [roomRules, t]);
  const rulesSummaryTags = useMemo(() => {
    if (!rulesSummaryMeta) {
      return null;
    }
    const baseTags = rulesSummaryMeta.isHkTraditional
      ? [t('newGame.mode.hk'), rulesSummaryMeta.scoringLabel, rulesSummaryMeta.gunLabel, rulesSummaryMeta.stakeLabel]
      : [t('newGame.mode.hk'), rulesSummaryMeta.scoringLabel, rulesSummaryMeta.unitPerFanLabel];
    return [t('multiplayer.mode.sync'), ...baseTags];
  }, [rulesSummaryMeta, t]);
  const rulesSummaryStats = useMemo(() => {
    if (roomRules.mode !== 'HK' || !roomRules.hk || roomRules.hk.scoringPreset !== 'traditionalFan') {
      return null;
    }

    const capText =
      roomRules.hk.capFan === null
        ? t('gameTable.rules.capNone')
        : t('gameTable.rules.capValue').replace('{count}', String(roomRules.hk.capFan));
    const minFanText =
      roomRules.minFanToWin === 0
        ? t('gameTable.rules.minNone')
        : t('gameTable.rules.minValue').replace('{count}', String(roomRules.minFanToWin));

    return { capText, minFanText };
  }, [roomRules, t]);
  const customRulesSummaryStats = useMemo(() => {
    if (roomRules.mode !== 'HK' || !roomRules.hk || roomRules.hk.scoringPreset !== 'customTable') {
      return null;
    }

    const tags: string[] = [];
    if (typeof roomRules.hk.capFan === 'number') {
      tags.push(t('game.detail.rules.custom.capFan').replace('{fan}', String(roomRules.hk.capFan)));
    }
    if (typeof roomRules.minFanToWin === 'number' && roomRules.minFanToWin > 0) {
      tags.push(t('game.detail.rules.custom.minFan').replace('{fan}', String(roomRules.minFanToWin)));
    }
    tags.push(t('game.detail.rules.custom.multiplier'));
    return tags;
  }, [roomRules, t]);
  const currencyCode = roomRules.currencyCode;
  const minFanInput = useMemo(() => Math.max(1, roomRules.minFanToWin ?? 0), [roomRules.minFanToWin]);
  const maxFanInput = useMemo(() => {
    const configuredCap = roomRules.hk?.capFan;
    const cap = typeof configuredCap === 'number' ? configuredCap : 13;
    return Math.max(minFanInput, cap);
  }, [minFanInput, roomRules.hk?.capFan]);
  const currentFanInput = useMemo(() => {
    const parsed = Number(fanInput.trim());
    if (!Number.isInteger(parsed)) {
      return minFanInput;
    }
    return Math.min(maxFanInput, Math.max(minFanInput, parsed));
  }, [fanInput, maxFanInput, minFanInput]);
  const elapsedLabel = useMemo(() => {
    if (!room?.createdAt) {
      return null;
    }
    const elapsedMs = Math.max(0, elapsedNow - room.createdAt);
    const minutes = Math.floor(elapsedMs / 60000);
    if (minutes < 60) {
      return t('gameTable.elapsed.minutes').replace('{minutes}', String(minutes));
    }
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    if (remain === 0) {
      return t('gameTable.elapsed.hours').replace('{hours}', String(hours));
    }
    return t('gameTable.elapsed.hoursMinutes')
      .replace('{hours}', String(hours))
      .replace('{minutes}', String(remain));
  }, [elapsedNow, room?.createdAt, t]);
  const footerLabel = useMemo(() => {
    if (!elapsedLabel) {
      return null;
    }
    return elapsedLabel;
  }, [elapsedLabel]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: gameTitle,
    });
  }, [gameTitle, navigation]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedNow(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;

    const loadTotals = async () => {
      const [hands, lineups] = await Promise.all([listHands(roomId), listLineups(roomId)]);
      const lineupByVersion = new Map(lineups.map((entry) => [entry.lineupVersion, entry] as const));
      const nextTotals: Record<string, number> = {};
      let nextDealerSeatIndex = 0;
      let dealerAdvanceCount = 0;

      for (const hand of hands) {
        const handLineup = lineupByVersion.get(hand.lineupVersion) ?? null;
        if (hand.type === 'draw') {
          const nextDealer = getDealerSeatIndexAfterHand(nextDealerSeatIndex, hand, handLineup);
          if (nextDealer !== nextDealerSeatIndex) {
            dealerAdvanceCount += 1;
          }
          nextDealerSeatIndex = nextDealer;
          continue;
        }

        if (!handLineup || !hand.winnerPlayerId) {
          continue;
        }

        const seatPlayerIds = SEAT_KEYS.map((seatKey) => handLineup.seats[seatKey]);
        const winnerSeatIndex = seatPlayerIds.findIndex((playerId) => playerId === hand.winnerPlayerId);
        const discarderSeatIndex =
          hand.type === 'discard'
            ? seatPlayerIds.findIndex((playerId) => playerId === (hand.discarderPlayerId ?? null))
            : -1;

        if (winnerSeatIndex < 0 || (hand.type === 'discard' && discarderSeatIndex < 0)) {
          continue;
        }

        const settlement = computeHkSettlement({
          rules: roomRules,
          fan: hand.fan ?? minFanInput,
          settlementType: hand.type === 'zimo' ? 'zimo' : 'discard',
          winnerSeatIndex,
          discarderSeatIndex: hand.type === 'discard' ? discarderSeatIndex : null,
        });

        SEAT_KEYS.forEach((seatKey, seatIndex) => {
          const playerId = handLineup.seats[seatKey];
          if (!playerId) {
            return;
          }
          nextTotals[playerId] = (nextTotals[playerId] ?? 0) + settlement.deltasQ[seatIndex];
        });
        const nextDealer = getDealerSeatIndexAfterHand(nextDealerSeatIndex, hand, handLineup);
        if (nextDealer !== nextDealerSeatIndex) {
          dealerAdvanceCount += 1;
        }
        nextDealerSeatIndex = nextDealer;
      }

      if (alive) {
        setTotalsQByPlayerId(nextTotals);
        setDealerSeatIndex(nextDealerSeatIndex);
        setRoundState({
          dealerSeatIndex: nextDealerSeatIndex,
          dealerAdvanceCount,
          handCount: hands.length,
        });
      }
    };

    loadTotals().catch(() => {
      if (alive) {
        setTotalsQByPlayerId({});
        setDealerSeatIndex(0);
        setRoundState({
          dealerSeatIndex: 0,
          dealerAdvanceCount: 0,
          handCount: 0,
        });
      }
    });

    return () => {
      alive = false;
    };
  }, [minFanInput, roomId, roomRules, roomVersion]);

  const panelStyleBySeat = useMemo(() => {
    if (!tableLayout) {
      return null;
    }

    const center = { x: tableLayout.x + tableLayout.width / 2, y: tableLayout.y + tableLayout.height / 2 };
    const corners = {
      topLeft: { x: tableLayout.x, y: tableLayout.y },
      topRight: { x: tableLayout.x + tableLayout.width, y: tableLayout.y },
      bottomRight: { x: tableLayout.x + tableLayout.width, y: tableLayout.y + tableLayout.height },
      bottomLeft: { x: tableLayout.x, y: tableLayout.y + tableLayout.height },
    };

    const lerp = (from: { x: number; y: number }, to: { x: number; y: number }, ratio: number) => ({
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
    });

    const anchors = {
      0: lerp(center, corners.bottomRight, 0.75),
      1: lerp(center, corners.topRight, 0.75),
      2: lerp(center, corners.topLeft, 0.75),
      3: lerp(center, corners.bottomLeft, 0.75),
    } as const;

    const offsets = {
      0: { dx: 4, dy: 7 },
      1: { dx: 4, dy: -7 },
      2: { dx: -4, dy: -7 },
      3: { dx: -4, dy: 7 },
    } as const;

    const makeStyle = (seatIndex: 0 | 1 | 2 | 3) => ({
      position: 'absolute' as const,
      left: anchors[seatIndex].x + offsets[seatIndex].dx - panelWidth / 2,
      top: anchors[seatIndex].y + offsets[seatIndex].dy - panelHeight / 2,
      width: panelWidth,
      height: panelHeight,
    });

    return {
      0: makeStyle(0),
      1: makeStyle(1),
      2: makeStyle(2),
      3: makeStyle(3),
    } as Record<number, StyleProp<ViewStyle>>;
  }, [panelHeight, panelWidth, tableLayout]);

  const onTableLayout = useCallback((event: LayoutChangeEvent) => {
    const { x, y, width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
    setTableLayout({ x, y, width: layoutWidth, height: layoutHeight });
  }, []);

  const closeRecordModal = useCallback(() => {
    setRecordModalVisible(false);
  }, []);

  const openRecordModal = useCallback(
    (seatIndex: number) => {
      if (!canSubmit || room?.status === 'ended' || room?.status === 'archived') {
        return;
      }
      const targetPlayer = seatPanels[seatIndex]?.player;
      if (!targetPlayer) {
        return;
      }
      setSelectedWinnerId(targetPlayer.playerId);
      setFanInput(String(minFanInput));
      if (selectedDiscarderId === targetPlayer.playerId) {
        const nextDiscarder = activePlayers.find((player) => player.playerId !== targetPlayer.playerId);
        setSelectedDiscarderId(nextDiscarder?.playerId ?? '');
      }
      setSettlementType('discard');
      setRecordModalVisible(true);
    },
    [activePlayers, canSubmit, minFanInput, room?.status, seatPanels, selectedDiscarderId],
  );

  const submit = useCallback(
    async (type: 'zimo' | 'discard' | 'draw', dealerAction?: DrawDealerAction) => {
      if (!uid) {
        return;
      }
      if (type !== 'draw' && !selectedWinnerId) {
        setNotice(t('multiplayer.notice.selectWinner'));
        return;
      }
      if (type === 'discard' && !selectedDiscarderId) {
        setNotice(t('multiplayer.notice.selectDiscarder'));
        return;
      }
      if (type === 'discard' && selectedWinnerId === selectedDiscarderId) {
        setNotice(t('multiplayer.notice.invalidDiscardResult'));
        return;
      }

      const result = await submitHand({
        roomId,
        submittedByUid: uid,
        type,
        baseVersion: roomVersion,
        winnerPlayerId: type === 'draw' ? null : selectedWinnerId,
        discarderPlayerId: type === 'discard' ? selectedDiscarderId : null,
        dealerAction: type === 'draw' ? dealerAction ?? 'stick' : null,
        fan: type === 'draw' ? undefined : currentFanInput,
      });
      if (!result.ok) {
        setNotice(t('multiplayer.notice.submitFailed', { code: result.code, message: result.message }));
        if (result.code === 'VERSION_CONFLICT') {
          await refreshHands();
        }
        return;
      }
      setNotice(
        formatMessage(t('multiplayer.notice.submitSuccess'), {
          handIndex: result.nextHandIndex,
          version: result.nextVersion,
        }),
      );
      setRecordModalVisible(false);
      await refreshHands();
    },
    [currentFanInput, refreshHands, roomId, roomVersion, selectedDiscarderId, selectedWinnerId, t, uid],
  );

  const endAndArchive = useCallback(() => {
    if (!uid || !room || endingRoomRef.current === roomId) {
      return;
    }

    Alert.alert(t('gameTable.endGame.title'), t('gameTable.endGame.message'), [
      { text: t('gameTable.endGame.cancel'), style: 'cancel' },
      {
        text: t('gameTable.endGame.confirm'),
        style: 'destructive',
        onPress: async () => {
          if (endingRoomRef.current === roomId) {
            return;
          }
          try {
            endingRoomRef.current = roomId;
            setEndingGame(true);
            setArchiving(true);
            setNotice(t('multiplayer.notice.ending'));

            const result = await endRoom(roomId, uid);
            if (!result.ok) {
              setNotice(t('multiplayer.notice.submitFailed', { code: result.code, message: result.message }));
              return;
            }

            const summary = await archiveRoomToLocal(roomId, uid);
            archivedRoomRef.current = roomId;
            setNotice(
              formatMessage(t('multiplayer.notice.archiveReady'), {
                handCount: summary.handCount,
              }),
            );
            navigation.replace('CloudArchiveDetail', { roomId });
          } catch (error) {
            setNotice(t('multiplayer.notice.archiveFailed', { message: String(error) }));
          } finally {
            endingRoomRef.current = null;
            setEndingGame(false);
            setArchiving(false);
          }
        },
      },
    ]);
  }, [navigation, room, roomId, t, uid]);

  const handleDrawActionPress = useCallback(() => {
    if (!canSubmit || room?.status === 'ended' || room?.status === 'archived') {
      return;
    }
    Alert.alert(t('gameTable.draw.title'), t('gameTable.draw.message'), [
      { text: t('gameTable.draw.cancel'), style: 'cancel' },
      {
        text: t('gameTable.draw.stick'),
        onPress: () => {
          submit('draw', 'stick').catch(() => {});
        },
      },
      {
        text: t('gameTable.draw.pass'),
        onPress: () => {
          submit('draw', 'pass').catch(() => {});
        },
      },
    ]);
  }, [canSubmit, room?.status, submit, t]);

  const currentWinner = activePlayers.find((player) => player.playerId === selectedWinnerId) ?? null;
  const discarderOptions = useMemo(
    () =>
      activePlayers
        .filter((player) => player.playerId !== selectedWinnerId)
        .map((player) => {
          const seatIndex = seatPanels.find((seat) => seat.player?.playerId === player.playerId)?.seatIndex ?? 0;
          return {
            key: player.playerId,
            label: `${formatSeatLabel(t, seatIndex, seatIndex === dealerSeatIndex)} ${player.displayName}`,
          };
        }),
    [activePlayers, dealerSeatIndex, seatPanels, selectedWinnerId, t],
  );
  const currentWinnerSeatIndex =
    seatPanels.find((seat) => seat.player?.playerId === currentWinner?.playerId)?.seatIndex ?? null;

  return (
    <ScreenContainer style={styles.tableScreen} includeTopInset={false} includeBottomInset={false} horizontalPadding={0}>
      <View style={styles.container}>
        <View style={styles.contentArea}>
          <View style={styles.headerInfoBlock}>
            <AppText style={styles.roundLabel}>{roundLabel}</AppText>
            <AppText style={styles.roundSummaryLine}>
              {t('gameTable.roundSummary').replace('{round}', String(roundIndex)).replace('{status}', handCountLabel)}
            </AppText>
            <View style={styles.roundDivider} />
          </View>

          {rulesSummaryTags ? (
            <View style={styles.rulesSummaryCard}>
              <View style={styles.ruleTagsRow}>
                {rulesSummaryTags.map((tag) => (
                  <View key={tag} style={styles.ruleTag}>
                    <AppText style={styles.ruleTagText}>{tag}</AppText>
                  </View>
                ))}
              </View>
              {rulesSummaryStats ? (
                <View style={styles.rulesStatsRow}>
                  <View style={styles.rulesStatBadge}>
                    <AppText style={styles.rulesStatEmoji}>🧨</AppText>
                    <AppText style={styles.rulesStatValue}>{rulesSummaryStats.capText}</AppText>
                  </View>
                  <View style={styles.rulesStatBadge}>
                    <AppText style={styles.rulesStatValue}>{rulesSummaryStats.minFanText}</AppText>
                  </View>
                </View>
              ) : null}
              {customRulesSummaryStats?.length ? (
                <View style={styles.ruleTagsRow}>
                  {customRulesSummaryStats.map((tag) => (
                    <View key={tag} style={styles.ruleTag}>
                      <AppText style={styles.ruleTagText}>{tag}</AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.tableZone}>
            <View style={[styles.tableWrap, { width: tableSize, height: tableSize, marginTop: tableVerticalOffset }]}>
              <View style={[styles.tableOuter, { width: tableSize, height: tableSize }]} onLayout={onTableLayout}>
                <View style={styles.tableBoard} pointerEvents="none">
                  <View style={styles.tableBoardInset} />
                </View>
              </View>

              <View style={styles.centerBadge}>
                <View style={styles.centerDealerDot} />
                <AppText style={styles.centerBadgeLabel}>{t('gameTable.currentDealer')}</AppText>
                <AppText style={[styles.centerBadgeValue, { color: SEAT_COLORS[dealerSeatIndex] ?? theme.colors.danger }]}>
                  {SEAT_GLYPHS[dealerSeatIndex] ?? t('seat.east')}
                </AppText>
              </View>

              {panelStyleBySeat
                ? SEAT_INDEX_ORDER.map((seatIndex) => {
                    const seat = seatPanels[seatIndex];
                    return (
                      <CloudPlayerPanel
                        key={`seat-${seatIndex}`}
                        seatIndex={seatIndex}
                        seatLabel={seat.seatLabel}
                        displayName={seat.displayName}
                        _isHost={seat.isHost}
                        _isSelf={seat.isSelf}
                        _isTemporary={seat.isTemporary}
                        isDealer={seat.isDealer}
                        amount={seat.amount}
                        currencyCode={currencyCode}
                        occupied={seat.occupied}
                        onPress={() => openRecordModal(seatIndex)}
                        disabled={!canSubmit || !seat.occupied}
                        style={panelStyleBySeat[seatIndex]}
                      />
                    );
                  })
                : null}
            </View>
          </View>
        </View>

        <View style={[styles.footerArea, { paddingBottom: insets.bottom + 16 }]}>
          {footerLabel ? <AppText style={styles.elapsedText}>{footerLabel}</AppText> : null}

          <View style={styles.footerButtonsRow}>
            <AppButton
              label={t('gameTable.action.draw')}
              onPress={handleDrawActionPress}
              disabled={!canSubmit}
              variant="secondary"
              style={styles.footerButton}
            />
            <AppButton
              label={t('gameTable.action.endGame')}
              onPress={() => {
                endAndArchive();
              }}
              disabled={room?.status === 'ended' || room?.status === 'archived' || archiving || endingGame}
              style={styles.footerButton}
            />
          </View>
        </View>
      </View>

      <Modal transparent animationType="fade" visible={recordModalVisible} onRequestClose={closeRecordModal}>
        <Pressable style={styles.modalOverlay} onPress={closeRecordModal}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              <Card style={styles.sectionCard}>
                <AppText style={styles.sectionTitle}>{t('addHand.winner')}</AppText>
                <AppText style={styles.readonlyWinnerText}>
                  {currentWinner && currentWinnerSeatIndex !== null
                    ? `${formatSeatLabel(t, currentWinnerSeatIndex, currentWinnerSeatIndex === dealerSeatIndex)} ${currentWinner.displayName}`
                    : '--'}
                </AppText>
              </Card>

              <Card style={styles.sectionCard}>
                <AppText style={styles.sectionTitle}>{t('addHand.settlementType')}</AppText>
                <View style={styles.modeRow}>
                  <Pressable
                    style={[styles.modeButton, settlementType === 'discard' ? styles.modeButtonActive : null]}
                    onPress={() => setSettlementType('discard')}
                  >
                    <AppText style={[styles.modeButtonText, settlementType === 'discard' ? styles.modeButtonTextActive : null]}>
                      {t('addHand.settlementType.discard')}
                    </AppText>
                  </Pressable>
                  <Pressable
                    style={[styles.modeButton, settlementType === 'zimo' ? styles.modeButtonActive : null]}
                    onPress={() => {
                      setSettlementType('zimo');
                      setSelectedDiscarderId('');
                    }}
                  >
                    <AppText style={[styles.modeButtonText, settlementType === 'zimo' ? styles.modeButtonTextActive : null]}>
                      {t('addHand.settlementType.zimo')}
                    </AppText>
                  </Pressable>
                </View>
              </Card>

              {settlementType === 'discard' ? (
                <Card style={styles.sectionCard}>
                  <AppText style={styles.sectionTitle}>{t('addHand.discarder')}</AppText>
                  <PillGroup
                    options={discarderOptions}
                    valueKey={selectedDiscarderId || null}
                    onChange={(next) => setSelectedDiscarderId(next ?? '')}
                    includeNoneOption={false}
                  />
                </Card>
              ) : null}

              <Card style={styles.sectionCard}>
                <AppText style={styles.sectionTitle}>{t('addHand.inputFan')}</AppText>
                <View style={styles.stepperContainer}>
                  <Pressable
                    style={styles.stepperButton}
                    onPress={() => {
                      setFanInput(String(Math.max(minFanInput, currentFanInput - 1)));
                    }}
                  >
                    <AppText style={styles.stepperButtonText}>-</AppText>
                  </Pressable>
                  <AppText style={styles.stepperValue}>{currentFanInput}</AppText>
                  <Pressable
                    style={styles.stepperButton}
                    onPress={() => {
                      setFanInput(String(Math.min(maxFanInput, currentFanInput + 1)));
                    }}
                  >
                    <AppText style={styles.stepperButtonText}>+</AppText>
                  </Pressable>
                </View>
              </Card>

              {notice ? <AppText style={styles.modalErrorText}>{notice}</AppText> : null}
            </ScrollView>

            <View style={styles.modalActions}>
              <AppButton
                label={t('common.back')}
                onPress={closeRecordModal}
                variant="secondary"
                style={styles.secondaryButton}
              />
              <AppButton
                label={t('addHand.save')}
                onPress={() => {
                  submit(settlementType).catch(() => {});
                }}
                style={styles.primaryButton}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

function CloudPlayerPanel({
  seatIndex,
  seatLabel,
  displayName,
  _isHost,
  _isSelf,
  _isTemporary,
  isDealer,
  amount,
  currencyCode,
  occupied,
  onPress,
  disabled,
  style,
}: {
  seatIndex: number;
  seatLabel: string;
  displayName: string;
  _isHost: boolean;
  _isSelf: boolean;
  _isTemporary: boolean;
  isDealer: boolean;
  amount: number;
  currencyCode: CurrencyCode;
  occupied: boolean;
  onPress: () => void;
  disabled: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const amountColor =
    amount > 0 ? '#188038' : amount < 0 ? '#C5221F' : theme.colors.textSecondary;
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  const { symbol } = getCurrencyMeta(currencyCode);
  return (
    <Pressable style={[styles.playerPanel, style, disabled ? styles.playerPanelDisabled : null]} onPress={onPress} disabled={disabled}>
      <View style={styles.playerPanelCard}>
        <AppText style={styles.playerName} numberOfLines={1}>
          {displayName}
        </AppText>
        <View style={styles.playerMetaRow}>
          <AppText style={[styles.playerSeat, { color: SEAT_COLORS[seatIndex] ?? theme.colors.textSecondary }]}>{SEAT_GLYPHS[seatIndex] ?? seatLabel}</AppText>
          {isDealer ? <AppText style={styles.dealerText}>{` · ${'莊'}`}</AppText> : null}
        </View>
        {occupied ? (
          <AppText style={[styles.playerAmount, { color: amountColor }]}>
            {`${sign}${symbol}${formatMoneyValue(Math.abs(amount))}`}
          </AppText>
        ) : <AppText style={styles.playerAmount}>{'--'}</AppText>}
      </View>
    </Pressable>
  );
}

function formatMoneyValue(amount: number): string {
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return amount.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

const styles = StyleSheet.create({
  tableScreen: {
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  headerInfoBlock: {
    marginTop: 4,
    marginBottom: 2,
  },
  roundLabel: {
    ...typography.title,
    textAlign: 'left',
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 0,
  },
  roundSummaryLine: {
    ...typography.body,
    textAlign: 'left',
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginTop: 0,
    marginBottom: 2,
  },
  roundSummaryLineReadOnly: {
    color: theme.colors.danger,
  },
  roundDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E4EA',
    opacity: 0.9,
    marginTop: 2,
    marginBottom: 4,
  },
  rulesSummaryCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 2,
    marginBottom: 10,
  },
  ruleTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  ruleTag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#E2E4EA',
    marginRight: 5,
    marginBottom: 4,
  },
  ruleTagText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  rulesStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    marginTop: 2,
    gap: 5,
  },
  rulesStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#E2E4EA',
    marginBottom: 4,
  },
  rulesStatEmoji: {
    marginRight: 4,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  },
  rulesStatValue: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '400',
    color: theme.colors.textPrimary,
  },
  tableZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 42,
    paddingBottom: 8,
  },
  tableWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableBoard: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    backgroundColor: '#c49a6c',
    borderWidth: 1,
    borderColor: '#9d7448',
    shadowColor: '#7f5a36',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    overflow: 'hidden',
    transform: [{ rotate: '45deg' }],
  },
  tableBoardInset: {
    position: 'absolute',
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(89, 56, 30, 0.12)',
  },
  centerBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 106,
    height: 106,
    marginLeft: -53,
    marginTop: -53,
    borderRadius: 53,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDealerDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    marginBottom: 6,
  },
  centerBadgeLabel: {
    ...typography.body,
    color: theme.colors.textSecondary,
    opacity: 0.82,
    fontWeight: '500',
    marginBottom: 4,
  },
  centerBadgeValue: {
    fontSize: Math.round(theme.fontSize.xl * 1.12),
    fontWeight: '700',
    color: theme.colors.textPrimary,
    lineHeight: 38,
  },
  playerPanel: {
    position: 'absolute',
    alignItems: 'center',
  },
  playerPanelDisabled: {
    opacity: 0.96,
  },
  playerPanelCard: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.97)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  playerName: {
    ...typography.subtitle,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
    width: '100%',
  },
  playerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  playerSeat: {
    ...typography.caption,
    fontWeight: '600',
  },
  dealerText: {
    ...typography.body,
    fontWeight: '700',
    color: theme.colors.danger,
  },
  playerAmount: {
    ...typography.body,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    letterSpacing: 0.4,
    alignSelf: 'flex-start',
  },
  noticeText: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginTop: 12,
  },
  footerArea: {
    paddingHorizontal: 24,
    paddingTop: 8,
    backgroundColor: theme.colors.background,
  },
  footerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 16,
    marginTop: 8,
  },
  footerButton: {
    flex: 1,
  },
  elapsedText: {
    ...typography.caption,
    textAlign: 'center',
    color: theme.colors.textSecondary,
    opacity: 0.9,
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    maxHeight: '82%',
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 8,
  },
  sectionCard: {
    marginBottom: 12,
  },
  sectionTitle: {
    ...typography.subtitle,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  readonlyWinnerText: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  modeButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(58,136,132,0.16)',
  },
  modeButtonText: {
    ...typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryLight,
  },
  stepperButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  stepperValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  modalCaption: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: 8,
  },
  modalErrorText: {
    ...typography.body,
    marginTop: 8,
    marginBottom: 8,
    color: theme.colors.danger,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  secondaryButton: {
    flex: 1,
    marginRight: 8,
  },
  primaryButton: {
    flex: 1,
  },
});

export default MultiplayerGameTableScreen;
