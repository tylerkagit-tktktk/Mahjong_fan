import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppText from '../../components/AppText';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import AppButton from '../../components/AppButton';
import Card from '../../components/Card';
import HostToolsCard from '../../components/HostToolsCard';
import PlayerSeatCard from '../../components/PlayerSeatCard';
import ScreenContainer from '../../components/ScreenContainer';
import TextField from '../../components/TextField';
import { ResolvedRoomPlayer, Room, RoomLineup, RoomStatus, SeatKey } from '../../models/cloud';
import { RootStackParamList } from '../../navigation/types';
import { typography } from '../../styles/typography';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import {
  addTemporaryPlayer,
  addTemporaryPlayers,
  createInvite,
  deleteRoomAndFallbackToLocal,
  getBenchPlayers,
  getDefaultStartSeats,
  listRoomPlayers,
  mergeTemporaryPlayerIntoRealPlayer,
  proposeLineupChange,
  startRoom,
  subscribeRoomState,
} from '../../services/cloud/roomRepo';
import { ensureSession } from '../../services/cloud/authRepo';
import { clearActiveJoinedRoomPointer } from '../../services/cloud/storage';
import theme from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'RoomLobby'>;

const SEAT_KEYS: SeatKey[] = ['0', '1', '2', '3'];

function RoomLobbyScreen({ navigation, route }: Props) {
  const { t } = useAppLanguage();
  const roomId = route.params.roomId;
  const [sessionUid, setSessionUid] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<ResolvedRoomPlayer[]>([]);
  const [lineup, setLineup] = useState<RoomLineup | null>(null);
  const [hostToolsExpanded, setHostToolsExpanded] = useState(false);
  const [inviteText, setInviteText] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<SeatKey>('0');
  const [selectedBenchId, setSelectedBenchId] = useState('');
  const [savingSwap, setSavingSwap] = useState(false);
  const [tempPlayerName, setTempPlayerName] = useState('');
  const [addingTempPlayer, setAddingTempPlayer] = useState(false);
  const [startSetupVisible, setStartSetupVisible] = useState(false);
  const [startTempNames, setStartTempNames] = useState<string[]>([]);
  const [startingRoomBusy, setStartingRoomBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedTempMergeId, setSelectedTempMergeId] = useState('');
  const [selectedRealMergeUid, setSelectedRealMergeUid] = useState('');
  const [mergingPlayers, setMergingPlayers] = useState(false);
  const didEnterActiveTable = useRef(false);
  const hasLoadedRoom = useRef(false);
  const didHandleRoomExit = useRef(false);

  const leaveRemovedRoom = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.replace('Home');
  }, [navigation]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const loadPromise = (async () => {
      const session = await ensureSession('google');
      setSessionUid(session.uid);

      if (!roomId) {
        Alert.alert(t('roomLobby.alert.missingRoomTitle'), t('roomLobby.alert.missingRoomMessage'));
        navigation.goBack();
        return;
      }

      unsubscribe = subscribeRoomState(roomId, session.uid, (state) => {
        if (state.room?.status === 'cancelling' && state.room.hostUid !== session.uid && !didHandleRoomExit.current) {
          didHandleRoomExit.current = true;
          clearActiveJoinedRoomPointer({ uid: session.uid, roomId }).catch(() => {});
          Alert.alert(
            t('roomLobby.alert.roomRemovedTitle'),
            t('roomLobby.alert.roomRemovedMessage'),
            [{ text: t('common.ok'), onPress: leaveRemovedRoom }],
            { cancelable: false },
          );
        } else if (state.room) {
          hasLoadedRoom.current = true;
        } else if (hasLoadedRoom.current && !didHandleRoomExit.current) {
          didHandleRoomExit.current = true;
          clearActiveJoinedRoomPointer({ uid: session.uid, roomId }).catch(() => {});
          Alert.alert(
            t('roomLobby.alert.roomRemovedTitle'),
            t('roomLobby.alert.roomRemovedMessage'),
            [{ text: t('common.ok'), onPress: leaveRemovedRoom }],
            { cancelable: false },
          );
        }
        setRoom(state.room);
        setPlayers(state.players);
        setLineup(state.lineup);
      });
    })();

    loadPromise.catch((error) => {
      Alert.alert(t('roomLobby.alert.initFailedTitle'), String(error));
    });

    return () => {
      unsubscribe?.();
    };
  }, [leaveRemovedRoom, navigation, roomId, t]);

  useEffect(() => {
    if (room?.status !== 'active' || didEnterActiveTable.current) {
      return;
    }

    didEnterActiveTable.current = true;
    navigation.replace('MultiplayerGameTable', { roomId });
  }, [navigation, room?.status, roomId]);

  const seatLabels = useMemo(
    () => [t('seat.east'), t('seat.south'), t('seat.west'), t('seat.north')],
    [t],
  );

  const playerById = useMemo(() => {
    const next = new Map<string, ResolvedRoomPlayer>();
    for (const player of players) {
      next.set(player.playerId, player);
    }
    return next;
  }, [players]);

  const activeSeatCards = useMemo(() => {
    return SEAT_KEYS.map((seatKey, index) => {
      const playerId = lineup?.seats[seatKey] ?? null;
      const player = playerId ? playerById.get(playerId) ?? null : null;
      return {
        key: seatKey,
        seatLabel: seatLabels[index],
        displayName: player?.displayName ?? t('roomLobby.seat.openSeat'),
        avatarUrl: player?.avatarUrl ?? null,
        isHost: Boolean(player?.isHost),
        isSelf: Boolean(player?.isSelf),
        isTemporary: player?.kind === 'temporary',
        isOccupied: Boolean(player),
        statusLabel: player
          ? player.kind === 'temporary'
            ? t('roomLobby.seat.status.temporary')
            : t('roomLobby.seat.status.active')
          : t('roomLobby.seat.status.empty'),
      };
    });
  }, [lineup, playerById, seatLabels, t]);

  const benchPlayers = useMemo(() => getBenchPlayers(players, lineup), [players, lineup]);
  const hostPlayer = useMemo(() => players.find((player) => player.isHost) ?? null, [players]);
  const temporaryPlayers = useMemo(() => players.filter((player) => player.kind === 'temporary'), [players]);
  const realPlayers = useMemo(() => players.filter((player) => player.kind === 'member'), [players]);
  const roomStatusLabel = useMemo(() => getRoomStatusLabel(t, room?.status ?? 'open'), [room?.status, t]);
  const isHost = Boolean(room && sessionUid && room.hostUid === sessionUid);
  const canCreateInvite = Boolean(room && (room.status === 'open' || room.status === 'active'));
  const canSwap = Boolean(room && lineup && benchPlayers.length > 0);
  const realPlayerCount = players.filter((player) => player.kind === 'member').length;
  const totalPlayers = players.length;
  const missingStartSeats = Math.max(0, 4 - totalPlayers);
  const canAddTemporaryPlayer = Boolean(
    room && isHost && totalPlayers < (room.memberCap ?? 8) && room.status !== 'ended' && room.status !== 'archived',
  );

  useEffect(() => {
    if (!selectedBenchId) {
      return;
    }
    if (benchPlayers.some((player) => player.playerId === selectedBenchId)) {
      return;
    }
    setSelectedBenchId(benchPlayers[0]?.playerId ?? '');
  }, [benchPlayers, selectedBenchId]);

  useEffect(() => {
    if (!selectedTempMergeId) {
      return;
    }
    if (temporaryPlayers.some((player) => player.playerId === selectedTempMergeId)) {
      return;
    }
    setSelectedTempMergeId(temporaryPlayers[0]?.playerId ?? '');
  }, [selectedTempMergeId, temporaryPlayers]);

  useEffect(() => {
    if (!selectedRealMergeUid) {
      return;
    }
    if (realPlayers.some((player) => player.uid === selectedRealMergeUid)) {
      return;
    }
    setSelectedRealMergeUid(realPlayers.find((player) => player.uid)?.uid ?? '');
  }, [realPlayers, selectedRealMergeUid]);

  const handleCreateInvite = useCallback(async () => {
    if (!room) {
      return;
    }
    setInviteBusy(true);
    try {
      const invite = await createInvite(room.roomId, sessionUid);
      const nextInviteText = [
        room.title,
        `${t('roomLobby.hostTools.roomCode')}: ${invite.roomId}`,
        t('roomLobby.hostTools.localInviteNotice'),
      ].join('\n');
      setInviteText(nextInviteText);
    } catch (error) {
      Alert.alert(t('roomLobby.alert.createInviteFailedTitle'), String(error));
    } finally {
      setInviteBusy(false);
    }
  }, [room, sessionUid, t]);

  const handleShareInvite = useCallback(async () => {
    if (!inviteText || !room) {
      return;
    }
    try {
      await Share.share({
        title: room.title,
        message: inviteText,
      });
    } catch (error) {
      Alert.alert(t('roomLobby.alert.shareInviteFailedTitle'), String(error));
    }
  }, [inviteText, room, t]);

  const handleSwapSeat = useCallback(async () => {
    if (!room || !lineup || !selectedBenchId) {
      return;
    }
    setSavingSwap(true);
    try {
      const nextSeats = {
        ...lineup.seats,
        [selectedSeat]: selectedBenchId,
      } as Record<SeatKey, string>;
      const result = await proposeLineupChange({
        roomId: room.roomId,
        createdByUid: sessionUid,
        baseVersion: room.currentVersion,
        nextSeats,
      });
      if (!result.ok) {
        Alert.alert(t('roomLobby.alert.swapFailedTitle'), `${result.code}: ${result.message}`);
        return;
      }
      setSelectedBenchId('');
      setNotice(t('roomLobby.notice.swapSaved'));
    } catch (error) {
      Alert.alert(t('roomLobby.alert.swapFailedTitle'), String(error));
    } finally {
      setSavingSwap(false);
    }
  }, [lineup, room, selectedBenchId, selectedSeat, sessionUid, t]);

  const handleAddTemporaryPlayer = useCallback(async () => {
    if (!room || !tempPlayerName.trim()) {
      return;
    }
    setAddingTempPlayer(true);
    try {
      await addTemporaryPlayer({
        roomId: room.roomId,
        createdByUid: sessionUid,
        displayName: tempPlayerName,
      });
      setTempPlayerName('');
      setNotice(t('roomLobby.notice.tempAdded'));
    } catch (error) {
      Alert.alert(t('roomLobby.alert.tempPlayerFailedTitle'), String(error));
    } finally {
      setAddingTempPlayer(false);
    }
  }, [room, sessionUid, t, tempPlayerName]);

  const handleMergePlayers = useCallback(() => {
    if (!room || !selectedTempMergeId || !selectedRealMergeUid) {
      return;
    }
    Alert.alert(
      t('roomLobby.alert.mergeConfirmTitle'),
      t('roomLobby.alert.mergeConfirmMessage'),
      [
        { text: t('roomLobby.startSetup.cancel'), style: 'cancel' },
        {
          text: t('roomLobby.hostTools.mergeAction'),
          onPress: () => {
            setMergingPlayers(true);
            mergeTemporaryPlayerIntoRealPlayer({
              roomId: room.roomId,
              tempPlayerId: selectedTempMergeId,
              targetUid: selectedRealMergeUid,
              mergedByUid: sessionUid,
            })
              .then(async (result) => {
                if (!result.ok) {
                  throw new Error(`${result.code}: ${result.message}`);
                }
                setNotice(t('roomLobby.notice.tempAdded'));
                setSelectedTempMergeId('');
              })
              .catch((error) => {
                Alert.alert(t('roomLobby.alert.mergeFailedTitle'), String(error));
              })
              .finally(() => {
                setMergingPlayers(false);
              });
          },
        },
      ],
    );
  }, [room, selectedRealMergeUid, selectedTempMergeId, sessionUid, t]);

  const executeStartRoom = useCallback(async (startPlayers = players) => {
    if (!room) {
      return;
    }
    setStartingRoomBusy(true);
    try {
      const nextSeats = getDefaultStartSeats(startPlayers);
      if (!nextSeats) {
        setNotice(t('roomLobby.notice.needFourPlayers'));
        return;
      }
      const result = await startRoom({
        roomId: room.roomId,
        startedByUid: sessionUid,
        baseVersion: room.currentVersion,
        nextSeats,
      });
      if (!result.ok) {
        setNotice(t('roomLobby.notice.startFailed', { code: result.code, message: result.message }));
        return;
      }
      setNotice(t('roomLobby.notice.started'));
      navigation.replace('MultiplayerGameTable', { roomId: room.roomId });
    } catch (error) {
      Alert.alert(t('roomLobby.alert.startFailedTitle'), String(error));
    } finally {
      setStartingRoomBusy(false);
      setStartSetupVisible(false);
      setStartTempNames([]);
    }
  }, [navigation, players, room, sessionUid, t]);

  const handleConfirmSingleRealFallback = useCallback(() => {
    if (!room) {
      return;
    }
    Alert.alert(
      t('roomLobby.alert.singleRealTitle'),
      t('roomLobby.alert.singleRealMessage'),
      [
        { text: t('roomLobby.alert.singleRealStay'), style: 'cancel' },
        {
          text: t('roomLobby.alert.singleRealConfirm'),
          style: 'destructive',
          onPress: () => {
            deleteRoomAndFallbackToLocal(room.roomId, sessionUid)
              .then(() => {
                navigation.replace('NewGameStepper', {
                  prefill: {
                    title: room.title,
                    currencyCode:
                      typeof room.rulesSnapshot.currencyCode === 'string'
                        ? (room.rulesSnapshot.currencyCode as never)
                        : undefined,
                    serializedRules:
                      typeof room.rulesSnapshot.serializedRules === 'string'
                        ? room.rulesSnapshot.serializedRules
                        : undefined,
                  },
                });
              })
              .catch((error) => {
                Alert.alert(t('roomLobby.alert.startFailedTitle'), String(error));
              });
          },
        },
      ],
    );
  }, [navigation, room, sessionUid, t]);

  const handlePressStart = useCallback(() => {
    if (!room || !isHost) {
      return;
    }
    if (realPlayerCount <= 1) {
      handleConfirmSingleRealFallback();
      return;
    }
    if (missingStartSeats > 0) {
      setStartTempNames(Array.from({ length: missingStartSeats }, () => ''));
      setStartSetupVisible(true);
      return;
    }
    executeStartRoom().catch(() => {});
  }, [executeStartRoom, handleConfirmSingleRealFallback, isHost, missingStartSeats, realPlayerCount, room]);

  const handleConfirmStartWithTemps = useCallback(async () => {
    if (!room) {
      return;
    }
    const trimmedNames = startTempNames.map((value) => value.trim());
    if (trimmedNames.some((value) => value.length === 0)) {
      Alert.alert(t('roomLobby.alert.tempPlayerFailedTitle'), t('roomLobby.startSetup.required'));
      return;
    }

    setStartingRoomBusy(true);
    try {
      await addTemporaryPlayers({
        roomId: room.roomId,
        createdByUid: sessionUid,
        displayNames: trimmedNames,
      });
      const latestPlayers = await listRoomPlayers(room.roomId, sessionUid);
      await executeStartRoom(latestPlayers);
    } catch (error) {
      Alert.alert(t('roomLobby.alert.startFailedTitle'), String(error));
      setStartingRoomBusy(false);
    }
  }, [executeStartRoom, room, sessionUid, startTempNames, t]);

  return (
    <ScreenContainer style={styles.screen} includeTopInset={false} horizontalPadding={0}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
        <View style={styles.headerBlock}>
          <View style={styles.pillRow}>
            <AppText style={styles.statusPill}>{roomStatusLabel}</AppText>
          </View>
          <AppText style={styles.title}>{room?.title ?? t('roomLobby.loading')}</AppText>
        </View>

        <Card style={styles.infoCard}>
          <AppText style={styles.sectionTitle}>{t('roomLobby.info.title')}</AppText>
          <InfoRow label={t('roomLobby.info.host')} value={hostPlayer?.displayName ?? '-'} />
          <InfoRow label={t('roomLobby.info.memberCount')} value={`${totalPlayers}/${room?.memberCap ?? 8}`} />
          <InfoRow label={t('roomLobby.info.status')} value={roomStatusLabel} />
          <InfoRow label={t('roomLobby.info.lineupVersion')} value={room?.activeLineupVersion ? String(room.activeLineupVersion) : '-'} />
          <InfoRow label={t('roomLobby.info.roomId')} value={room?.roomId ?? '-'} />
        </Card>

        {isHost && room?.status === 'open' ? (
          <Card style={styles.startCard}>
            <AppText style={styles.sectionTitle}>{t('roomLobby.start.title')}</AppText>
            <AppText style={styles.sectionSubtitle}>
              {realPlayerCount <= 1
                ? t('roomLobby.start.singleRealHint')
                : missingStartSeats > 0
                ? t('roomLobby.start.fillSeatsHint', { count: missingStartSeats })
                : t('roomLobby.start.readyHint')}
            </AppText>
            <AppButton
              label={startingRoomBusy ? t('roomLobby.start.starting') : t('roomLobby.start.action')}
              onPress={handlePressStart}
              disabled={startingRoomBusy}
            />
          </Card>
        ) : null}

        {!isHost && room?.status === 'open' ? (
          <Card>
            <AppText style={styles.noticeText}>{t('roomLobby.notice.waitingForHost')}</AppText>
          </Card>
        ) : null}

        {startSetupVisible ? (
          <Card style={styles.startCard}>
            <AppText style={styles.sectionTitle}>{t('roomLobby.startSetup.title')}</AppText>
            <AppText style={styles.sectionSubtitle}>{t('roomLobby.startSetup.subtitle')}</AppText>
            <View style={styles.actionStack}>
              {startTempNames.map((value, index) => (
                <TextField
                  key={`start-temp-${index}`}
                  label={t('roomLobby.startSetup.playerLabel', { seat: seatLabels[totalPlayers + index] ?? `${index + 1}` })}
                  value={value}
                  onChangeText={(text) => {
                    setStartTempNames((prev) => {
                      const next = [...prev];
                      next[index] = text;
                      return next;
                    });
                  }}
                  placeholder={t('roomLobby.startSetup.placeholder')}
                />
              ))}
              <AppButton
                label={startingRoomBusy ? t('roomLobby.start.starting') : t('roomLobby.startSetup.confirm')}
                onPress={() => {
                  handleConfirmStartWithTemps().catch(() => {});
                }}
                disabled={startingRoomBusy}
              />
              <AppButton
                label={t('roomLobby.startSetup.cancel')}
                onPress={() => {
                  setStartSetupVisible(false);
                  setStartTempNames([]);
                }}
                variant="secondary"
                disabled={startingRoomBusy}
              />
            </View>
          </Card>
        ) : null}

        {room?.status === 'archived' ? (
          <Card>
            <AppText style={styles.noticeText}>{t('roomLobby.archivedNotice')}</AppText>
          </Card>
        ) : null}

        <View style={styles.sectionBlock}>
          <AppText style={styles.sectionTitle}>{t('roomLobby.seats.title')}</AppText>
          <AppText style={styles.sectionSubtitle}>{t('roomLobby.seats.subtitle')}</AppText>
          <View style={styles.seatGrid}>
            {activeSeatCards.map((seat) => (
              <View key={seat.key} style={styles.seatCell}>
                <PlayerSeatCard
                  seatLabel={seat.seatLabel}
                  displayName={seat.displayName}
                  avatarUrl={seat.avatarUrl}
                  isHost={seat.isHost}
                  isSelf={seat.isSelf}
                  isTemporary={seat.isTemporary}
                  isOccupied={seat.isOccupied}
                  statusLabel={seat.statusLabel}
                  temporaryLabel={t('roomLobby.member.temporary')}
                />
              </View>
            ))}
          </View>
        </View>

        <Card>
          <AppText style={styles.sectionTitle}>{t('roomLobby.bench.title')}</AppText>
          {benchPlayers.length ? (
            <View style={styles.benchWrap}>
              {benchPlayers.map((player) => (
                <View key={player.playerId} style={styles.memberChip}>
                  <AppText style={styles.memberChipText}>{player.displayName}</AppText>
                  {player.kind === 'temporary' ? <AppText style={styles.memberChipMeta}>{t('roomLobby.member.temporary')}</AppText> : null}
                  {player.isHost ? <AppText style={styles.memberChipMeta}>{t('roomLobby.member.host')}</AppText> : null}
                  {player.isSelf ? <AppText style={styles.memberChipMeta}>{t('roomLobby.member.self')}</AppText> : null}
                </View>
              ))}
            </View>
          ) : (
            <AppText style={styles.emptyText}>{t('roomLobby.bench.empty')}</AppText>
          )}
        </Card>

        {isHost ? (
          <HostToolsCard
            title={t('roomLobby.hostTools.title')}
            subtitle={t('roomLobby.hostTools.subtitle')}
            expanded={hostToolsExpanded}
            onToggle={() => setHostToolsExpanded((prev) => !prev)}
          >
            <AppText style={styles.helperText}>{t('roomLobby.hostTools.inviteHint')}</AppText>
            <View style={styles.actionStack}>
              <AppButton
                label={inviteBusy ? t('roomLobby.hostTools.generating') : t('roomLobby.hostTools.createInvite')}
                onPress={() => {
                  handleCreateInvite().catch(() => {});
                }}
                disabled={!canCreateInvite || inviteBusy}
              />
              <AppButton
                label={t('roomLobby.hostTools.shareInvite')}
                onPress={() => {
                  handleShareInvite().catch(() => {});
                }}
                disabled={!inviteText}
                variant="secondary"
              />
            </View>

            {inviteText ? (
              <View style={styles.inviteCard}>
                <InviteRow label={t('roomLobby.hostTools.roomCode')} value={room?.roomId ?? '-'} />
                <InviteRow
                  label={t('roomLobby.hostTools.localInviteNoticeLabel')}
                  value={t('roomLobby.hostTools.localInviteNotice')}
                />
              </View>
            ) : null}

            <AppText style={styles.sectionTitle}>{t('roomLobby.hostTools.addTempTitle')}</AppText>
            <AppText style={styles.sectionSubtitle}>{t('roomLobby.hostTools.addTempHint')}</AppText>
            <View style={styles.actionStack}>
              <TextField
                label={t('roomLobby.hostTools.addTempLabel')}
                value={tempPlayerName}
                onChangeText={setTempPlayerName}
                placeholder={t('roomLobby.hostTools.addTempPlaceholder')}
              />
              <AppButton
                label={addingTempPlayer ? t('roomLobby.hostTools.addTempAdding') : t('roomLobby.hostTools.addTempAction')}
                onPress={() => {
                  handleAddTemporaryPlayer().catch(() => {});
                }}
                disabled={!canAddTemporaryPlayer || !tempPlayerName.trim() || addingTempPlayer}
              />
            </View>

            <AppText style={styles.sectionTitle}>{t('roomLobby.hostTools.swapTitle')}</AppText>
            <AppText style={styles.sectionSubtitle}>{t('roomLobby.hostTools.swapHint')}</AppText>

            {!lineup ? (
              <AppText style={styles.emptyText}>{t('roomLobby.hostTools.noLineup')}</AppText>
            ) : !canSwap ? (
              <AppText style={styles.emptyText}>{t('roomLobby.hostTools.noBench')}</AppText>
            ) : (
              <>
                <View style={styles.selectorBlock}>
                  <AppText style={styles.selectorLabel}>{t('roomLobby.hostTools.swapSeat')}</AppText>
                  <View style={styles.selectorWrap}>
                    {activeSeatCards.map((seat) => (
                      <Pressable
                        key={`seat-${seat.key}`}
                        onPress={() => setSelectedSeat(seat.key)}
                        style={({ pressed }) => [
                          styles.selectorChip,
                          selectedSeat === seat.key && styles.selectorChipActive,
                          pressed && styles.selectorChipPressed,
                        ]}
                      >
                        <AppText style={[styles.selectorChipText, selectedSeat === seat.key && styles.selectorChipTextActive]}>
                          {seat.seatLabel}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.selectorBlock}>
                  <AppText style={styles.selectorLabel}>{t('roomLobby.hostTools.swapPlayer')}</AppText>
                  <View style={styles.selectorWrap}>
                    {benchPlayers.map((player) => (
                      <Pressable
                        key={`bench-${player.playerId}`}
                        onPress={() => setSelectedBenchId(player.playerId)}
                        style={({ pressed }) => [
                          styles.selectorChip,
                          selectedBenchId === player.playerId && styles.selectorChipActive,
                          pressed && styles.selectorChipPressed,
                        ]}
                      >
                        <AppText
                          style={[
                            styles.selectorChipText,
                            selectedBenchId === player.playerId && styles.selectorChipTextActive,
                          ]}
                        >
                          {player.displayName}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <AppButton
                  label={t('roomLobby.hostTools.swapAction')}
                  onPress={() => {
                    handleSwapSeat().catch(() => {});
                  }}
                  disabled={!selectedBenchId || savingSwap}
                />
              </>
            )}

            <AppText style={styles.sectionTitle}>{t('roomLobby.hostTools.mergeTitle')}</AppText>
            <AppText style={styles.sectionSubtitle}>{t('roomLobby.hostTools.mergeHint')}</AppText>
            {!temporaryPlayers.length ? (
              <AppText style={styles.emptyText}>{t('roomLobby.hostTools.noTempPlayers')}</AppText>
            ) : realPlayers.length < 2 ? (
              <AppText style={styles.emptyText}>{t('roomLobby.hostTools.noRealPlayers')}</AppText>
            ) : (
              <>
                <View style={styles.selectorBlock}>
                  <AppText style={styles.selectorLabel}>{t('roomLobby.hostTools.mergeTemp')}</AppText>
                  <View style={styles.selectorWrap}>
                    {temporaryPlayers.map((player) => (
                      <Pressable
                        key={`temp-${player.playerId}`}
                        onPress={() => setSelectedTempMergeId(player.playerId)}
                        style={({ pressed }) => [
                          styles.selectorChip,
                          selectedTempMergeId === player.playerId && styles.selectorChipActive,
                          pressed && styles.selectorChipPressed,
                        ]}
                      >
                        <AppText
                          style={[
                            styles.selectorChipText,
                            selectedTempMergeId === player.playerId && styles.selectorChipTextActive,
                          ]}
                        >
                          {player.displayName}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.selectorBlock}>
                  <AppText style={styles.selectorLabel}>{t('roomLobby.hostTools.mergeReal')}</AppText>
                  <View style={styles.selectorWrap}>
                    {realPlayers
                      .filter((player) => !player.isHost || realPlayers.length > 1)
                      .map((player) => (
                        <Pressable
                          key={`real-${player.playerId}`}
                          onPress={() => setSelectedRealMergeUid(player.uid ?? '')}
                          style={({ pressed }) => [
                            styles.selectorChip,
                            selectedRealMergeUid === player.uid && styles.selectorChipActive,
                            pressed && styles.selectorChipPressed,
                          ]}
                        >
                          <AppText
                            style={[
                              styles.selectorChipText,
                              selectedRealMergeUid === player.uid && styles.selectorChipTextActive,
                            ]}
                          >
                            {player.displayName}
                          </AppText>
                        </Pressable>
                      ))}
                  </View>
                </View>

                <AppButton
                  label={t('roomLobby.hostTools.mergeAction')}
                  onPress={handleMergePlayers}
                  disabled={!selectedTempMergeId || !selectedRealMergeUid || mergingPlayers}
                  variant="secondary"
                />
              </>
            )}
          </HostToolsCard>
        ) : null}

        {notice ? (
          <Card>
            <AppText style={styles.noticeText}>{notice}</AppText>
          </Card>
        ) : null}

        <View style={styles.footerActions}>
          <AppButton
            label={t('roomLobby.enterTable')}
            onPress={() => navigation.navigate('MultiplayerGameTable', { roomId })}
            disabled={!room || room.status !== 'active'}
          />
          <AppButton
            label={t('roomLobby.viewProfile')}
            onPress={() => navigation.navigate('Profile', { roomId })}
            disabled={!room || room.status !== 'open'}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <AppText style={styles.infoLabel}>{label}</AppText>
      <AppText style={styles.infoValue}>{value}</AppText>
    </View>
  );
}

function InviteRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.inviteRow}>
      <AppText style={styles.infoLabel}>{label}</AppText>
      <AppText style={styles.inviteValue}>{value}</AppText>
    </View>
  );
}

function getRoomStatusLabel(t: (...args: any[]) => string, status: RoomStatus): string {
  if (status === 'active') {
    return t('cloud.status.active' as never);
  }
  if (status === 'ended') {
    return t('cloud.status.ended' as never);
  }
  if (status === 'archived') {
    return t('cloud.status.archived' as never);
  }
  if (status === 'cancelling') {
    return t('cloud.status.cancelling' as never);
  }
  return t('cloud.status.open' as never);
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    backgroundColor: theme.colors.background,
  },
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  headerBlock: {
    gap: 8,
    paddingTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
  },
  statusPill: {
    ...typography.caption,
    color: theme.colors.primaryDark,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  title: {
    ...typography.subtitle,
    fontSize: theme.fontSize.lg,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  infoCard: {
    gap: theme.spacing.sm,
  },
  startCard: {
    gap: theme.spacing.sm,
  },
  sectionBlock: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  infoLabel: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  infoValue: {
    ...typography.body,
    color: theme.colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  seatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -theme.spacing.xs,
    rowGap: theme.spacing.sm,
  },
  seatCell: {
    width: '50%',
    paddingHorizontal: theme.spacing.xs,
  },
  benchWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F5F1EA',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  memberChipText: {
    ...typography.body,
    color: theme.colors.textPrimary,
  },
  memberChipMeta: {
    ...typography.caption,
    color: theme.colors.primaryDark,
  },
  helperText: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  actionStack: {
    gap: theme.spacing.sm,
  },
  inviteCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: '#FAF8F4',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  inviteRow: {
    gap: 4,
  },
  inviteValue: {
    ...typography.body,
    color: theme.colors.textPrimary,
  },
  selectorBlock: {
    gap: theme.spacing.xs,
  },
  selectorLabel: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  selectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  selectorChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  selectorChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  selectorChipPressed: {
    opacity: 0.9,
  },
  selectorChipText: {
    ...typography.body,
    color: theme.colors.textPrimary,
  },
  selectorChipTextActive: {
    color: theme.colors.primaryDark,
    fontWeight: '700',
  },
  emptyText: {
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  noticeText: {
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  footerActions: {
    gap: theme.spacing.sm,
  },
});

export default RoomLobbyScreen;
