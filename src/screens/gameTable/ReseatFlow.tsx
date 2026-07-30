import { useEffect, useMemo, useRef, useState } from 'react';
import AppText from '../../components/AppText';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import AppButton from '../../components/AppButton';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import theme from '../../theme/theme';
import { shuffle } from '../newGameStepper/helpers';
import { PLAYER_COUNT } from '../newGameStepper/constants';
import PlayersSection from '../newGameStepper/sections/PlayersSection';
import { SeatMode, StartingDealerMode } from '../newGameStepper/types';

const MAX_PLAYER_NAME_LENGTH = 10;

type PlayerSeatEntry = {
  id: string;
  name: string;
};

type ReseatPlayerSeat = {
  id: string;
  name: string;
  seatIndex: number;
};

const seatOrder: number[] = [0, 1, 2, 3];

function sortPlayersBySeat(players: ReseatPlayerSeat[]): ReseatPlayerSeat[] {
  return [...players].sort((a, b) => seatOrder.indexOf(a.seatIndex) - seatOrder.indexOf(b.seatIndex));
}

type Props = {
  visible: boolean;
  allowNameEdit?: boolean;
  currentRoundLabelZh: string;
  handsCount: number;
  currentDealerSeatIndex: number;
  currentPlayersBySeat: PlayerSeatEntry[];
  onDismiss: () => void;
  onApplyReseat: (seatConfig: { seatByPlayerId: Record<string, number> }) => Promise<void>;
};

function ReseatFlow({
  visible,
  allowNameEdit = true,
  currentRoundLabelZh,
  handsCount,
  currentDealerSeatIndex,
  currentPlayersBySeat,
  onDismiss,
  onApplyReseat,
}: Props) {
  const { t } = useAppLanguage();
  const [modalVisible, setModalVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seatMode, setSeatMode] = useState<SeatMode>('manual');
  const [players, setPlayers] = useState<string[]>(['', '', '', '']);
  const [lockedPlayers, setLockedPlayers] = useState<ReseatPlayerSeat[]>([]);
  const [autoNames, setAutoNames] = useState<string[]>(['', '', '', '']);
  const [autoAssigned, setAutoAssigned] = useState<string[] | null>(null);
  const [startingDealerMode, setStartingDealerMode] = useState<StartingDealerMode>('manual');
  const [startingDealerSourceIndex, setStartingDealerSourceIndex] = useState<number | null>(0);
  const [selectedLockedPlayerId, setSelectedLockedPlayerId] = useState<string | null>(null);
  const manualPlayerRefs = useRef<Array<TextInput | null>>([]);
  const autoPlayerRefs = useRef<Array<TextInput | null>>([]);
  const hasPromptedRef = useRef(false);

  const seatLabels = useMemo<string[]>(
    () => [t('seat.east'), t('seat.south'), t('seat.west'), t('seat.north')],
    [t],
  );
  const originalSeatByPlayerId = useMemo(
    () =>
      currentPlayersBySeat.reduce<Record<string, number>>((acc, player, seatIndex) => {
        acc[player.id] = seatIndex;
        return acc;
      }, {}),
    [currentPlayersBySeat],
  );
  const hasLockedSeatChanges = useMemo(
    () =>
      !allowNameEdit &&
      lockedPlayers.length === PLAYER_COUNT &&
      lockedPlayers.some((player) => originalSeatByPlayerId[player.id] !== player.seatIndex),
    [allowNameEdit, lockedPlayers, originalSeatByPlayerId],
  );
  const selectedLockedPlayer = useMemo(
    () => lockedPlayers.find((player) => player.id === selectedLockedPlayerId) ?? null,
    [lockedPlayers, selectedLockedPlayerId],
  );

  useEffect(() => {
    if (!visible) {
      hasPromptedRef.current = false;
      setModalVisible(false);
      setSelectedLockedPlayerId(null);
      return;
    }
    if (hasPromptedRef.current) {
      return;
    }
    hasPromptedRef.current = true;
    Alert.alert(
      t('gameTable.reseat.promptTitle'),
      `${t('gameTable.reseat.promptBody')}\n${currentRoundLabelZh} · ${t('gameTable.handCount.started').replace(
        '{count}',
        String(handsCount),
      )}`,
      [
        {
          text: t('gameTable.reseat.action.skip'),
          style: 'cancel',
          onPress: onDismiss,
        },
        {
          text: t('gameTable.reseat.action.open'),
          onPress: () => {
            const names = currentPlayersBySeat.map((entry) => entry.name.slice(0, MAX_PLAYER_NAME_LENGTH));
            const baseLockedPlayers = sortPlayersBySeat(
              currentPlayersBySeat.map((entry, seatIndex) => ({
                id: entry.id,
                name: entry.name.slice(0, MAX_PLAYER_NAME_LENGTH),
                seatIndex,
              })),
            );
            setPlayers(names);
            setAutoNames(names);
            setLockedPlayers(baseLockedPlayers);
            setAutoAssigned(null);
            setSeatMode('manual');
            setStartingDealerMode('manual');
            setStartingDealerSourceIndex(currentDealerSeatIndex);
            setSelectedLockedPlayerId(null);
            setError(null);
            setModalVisible(true);
          },
        },
      ],
    );
  }, [currentDealerSeatIndex, currentPlayersBySeat, currentRoundLabelZh, handsCount, onDismiss, t, visible]);

  const handleConfirmReseatAuto = () => {
    const trimmed = autoNames.map((name) => name.trim());
    if (trimmed.some((name) => !name)) {
      setError(t('newGame.autoSeatRequired'));
      return;
    }
    setAutoAssigned(shuffle(trimmed));
    setError(null);
  };

  const handleSelectLockedSeat = (rowIndex: number, seatIndex: number) => {
    setLockedPlayers((prev) => {
      if (prev.length !== PLAYER_COUNT) {
        return prev;
      }
      if (rowIndex < 0 || rowIndex >= PLAYER_COUNT || seatIndex < 0 || seatIndex >= PLAYER_COUNT) {
        return prev;
      }
      const next = prev.map((entry) => ({ ...entry }));
      const originalSeat = next[rowIndex].seatIndex;
      const duplicateIndex = next.findIndex((entry, index) => entry.seatIndex === seatIndex && index !== rowIndex);
      if (duplicateIndex >= 0) {
        next[duplicateIndex].seatIndex = originalSeat;
      }
      next[rowIndex].seatIndex = seatIndex;
      return sortPlayersBySeat(next);
    });
    setError(null);
  };

  const handleSelectLockedPlayer = (rowIndex: number) => {
    if (busy || rowIndex < 0 || rowIndex >= lockedPlayers.length) {
      return;
    }
    const targetPlayer = lockedPlayers[rowIndex];
    if (!selectedLockedPlayerId) {
      setSelectedLockedPlayerId(targetPlayer.id);
      setError(null);
      return;
    }
    if (selectedLockedPlayerId === targetPlayer.id) {
      setSelectedLockedPlayerId(null);
      return;
    }
    const selectedRowIndex = lockedPlayers.findIndex((player) => player.id === selectedLockedPlayerId);
    if (selectedRowIndex < 0) {
      setSelectedLockedPlayerId(targetPlayer.id);
      return;
    }
    handleSelectLockedSeat(selectedRowIndex, targetPlayer.seatIndex);
    setSelectedLockedPlayerId(null);
  };

  const handleConfirm = async () => {
    if (busy) {
      return;
    }
    if (!allowNameEdit && !hasLockedSeatChanges) {
      return;
    }

    const resolvedPlayers =
      seatMode === 'manual' ? players.map((name) => name.trim()) : (autoAssigned ?? []).map((name) => name.trim());
    if (resolvedPlayers.length !== PLAYER_COUNT || resolvedPlayers.some((name) => !name)) {
      setError(t('newGame.autoSeatNeedConfirm'));
      return;
    }

    const currentIds = currentPlayersBySeat.map((entry) => entry.id);
    let selectedIds: string[] = [];
    if (!allowNameEdit && seatMode === 'manual') {
      if (lockedPlayers.length !== PLAYER_COUNT) {
        setError(t('gameTable.reseat.unsupported'));
        return;
      }
      const idsBySeat: Array<string | null> = Array.from({ length: PLAYER_COUNT }, () => null);
      for (const player of lockedPlayers) {
        const seatIndex = player.seatIndex;
        if (seatIndex < 0 || seatIndex >= PLAYER_COUNT || idsBySeat[seatIndex]) {
          setError(t('gameTable.reseat.unsupported'));
          return;
        }
        idsBySeat[seatIndex] = player.id ?? null;
      }
      if (idsBySeat.some((id) => !id)) {
        setError(t('gameTable.reseat.unsupported'));
        return;
      }
      selectedIds = idsBySeat as string[];
    } else {
      const usedIndices = new Set<number>();
      for (const name of resolvedPlayers) {
        const index = currentIds.findIndex((id, idx) => {
          if (usedIndices.has(idx)) {
            return false;
          }
          const player = currentPlayersBySeat.find((entry) => entry.id === id);
          return player?.name === name;
        });
        if (index < 0) {
          setError(t('gameTable.reseat.unsupported'));
          return;
        }
        usedIndices.add(index);
        selectedIds.push(currentIds[index]);
      }
    }

    if (selectedIds.length !== PLAYER_COUNT) {
      setError(t('gameTable.reseat.unsupported'));
      return;
    }
    const seatByPlayerId = selectedIds.reduce<Record<string, number>>((acc, playerId, seatIndex) => {
      acc[playerId] = seatIndex;
      return acc;
    }, {});

    setBusy(true);
    try {
      await onApplyReseat({ seatByPlayerId });
      setModalVisible(false);
      setSelectedLockedPlayerId(null);
      onDismiss();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || t('errors.addHand'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={modalVisible}
      onRequestClose={() => {
        if (!busy) {
          setModalVisible(false);
          onDismiss();
        }
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCardLarge}>
          <AppText style={styles.modalTitle}>{t('gameTable.reseat.modalTitle')}</AppText>
          {allowNameEdit ? (
            <>
              <AppText style={styles.modalSubtitleText}>{t('gameTable.reseat.modalSubtitle')}</AppText>
              <ScrollView
                style={styles.reseatScroll}
                contentContainerStyle={styles.reseatScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <PlayersSection
                  allowNameEdit
                  seatMode={seatMode}
                  seatLabels={seatLabels}
                  players={players}
                  autoNames={autoNames}
                  autoAssigned={autoAssigned}
                  startingDealerMode={startingDealerMode}
                  startingDealerSourceIndex={startingDealerSourceIndex}
                  playersError={error}
                  disabled={busy}
                  manualPlayerRefs={manualPlayerRefs}
                  autoPlayerRefs={autoPlayerRefs}
                  labels={{
                    sectionTitle: t('newGame.confirmModal.section.players'),
                    seatModeTitle: t('newGame.seatModeTitle'),
                    seatModeManual: t('newGame.seatMode.manual'),
                    seatModeAuto: t('newGame.seatMode.auto'),
                    playerManualHintPrefix: t('newGame.playerManualHintPrefix'),
                    playerManualHintSuffix: t('newGame.playerManualHintSuffix'),
                    playerAutoHintPrefix: t('newGame.playerAutoHintPrefix'),
                    playerAutoHintSuffix: t('newGame.playerAutoHintSuffix'),
                    playerNameBySeatSuffix: t('newGame.playerNameBySeatSuffix'),
                    playerOrderPrefix: t('newGame.playerOrderPrefix'),
                    playerOrderSuffix: t('newGame.playerOrderSuffix'),
                    autoSeatConfirm: t('newGame.autoSeatConfirm'),
                    autoSeatReshuffle: t('newGame.autoSeatReshuffle'),
                    autoSeatResult: t('newGame.autoSeatResult'),
                    autoSeatResultManualTitle: t('newGame.autoSeatResultManualTitle'),
                    autoSeatResultHint: t('newGame.autoSeatResultHint'),
                    autoSeatDealerExample: t('newGame.autoSeatDealerExample'),
                    manualSeatCaption: t('newGame.manualSeatCaption'),
                    startingDealerModeRandom: t('newGame.startingDealerMode.random'),
                    startingDealerModeManual: t('newGame.startingDealerMode.manual'),
                    autoFlowHint: t('newGame.autoFlowHint'),
                    dealerBadge: t('newGame.dealerBadge'),
                  }}
                  onSeatModeChange={(nextMode) => {
                    setSeatMode(nextMode);
                    setError(null);
                  }}
                  onSetPlayer={(index, value) => {
                    setPlayers((prev) => {
                      const next = [...prev];
                      next[index] = value.slice(0, MAX_PLAYER_NAME_LENGTH);
                      return next;
                    });
                  }}
                  onSetAutoName={(index, value) => {
                    setAutoNames((prev) => {
                      const next = [...prev];
                      next[index] = value.slice(0, MAX_PLAYER_NAME_LENGTH);
                      return next;
                    });
                  }}
                  onConfirmAutoSeat={handleConfirmReseatAuto}
                  onStartingDealerModeChange={setStartingDealerMode}
                  onSelectStartingDealer={setStartingDealerSourceIndex}
                />
              </ScrollView>
            </>
          ) : (
            <>
              <AppText style={styles.swapSubtitle}>{t('gameTable.reseat.swapSubtitle')}</AppText>
              <View style={styles.swapSteps} accessibilityRole="progressbar">
                <View style={styles.swapStepItem}>
                  <View style={[styles.swapStepNumber, styles.swapStepNumberActive]}>
                    <AppText style={[styles.swapStepNumberText, styles.swapStepNumberTextActive]}>1</AppText>
                  </View>
                  <AppText style={styles.swapStepText}>{t('gameTable.reseat.stepFirst')}</AppText>
                </View>
                <View style={styles.swapStepConnector} />
                <View style={styles.swapStepItem}>
                  <View style={[styles.swapStepNumber, selectedLockedPlayer && styles.swapStepNumberActive]}>
                    <AppText
                      style={[styles.swapStepNumberText, selectedLockedPlayer && styles.swapStepNumberTextActive]}
                    >
                      2
                    </AppText>
                  </View>
                  <AppText style={[styles.swapStepText, selectedLockedPlayer && styles.swapStepTextActive]}>
                    {t('gameTable.reseat.stepSecond')}
                  </AppText>
                </View>
              </View>

              <View style={styles.lockedSeatList}>
                {lockedPlayers.map((player, rowIndex) => {
                  const selected = player.id === selectedLockedPlayerId;
                  const seatLabel = seatLabels[player.seatIndex] ?? '';
                  return (
                    <Pressable
                      key={player.id}
                      testID={`reseat-player-row-${player.seatIndex}`}
                      onPress={() => handleSelectLockedPlayer(rowIndex)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`${seatLabel} ${player.name}${player.seatIndex === 0 ? ` ${t('newGame.dealerBadge')}` : ''}`}
                      accessibilityHint={
                        selectedLockedPlayer
                          ? t('gameTable.reseat.selectSecondHint')
                          : t('gameTable.reseat.selectFirstHint')
                      }
                      accessibilityState={{ selected, disabled: busy }}
                      style={({ pressed }) => [
                        styles.lockedSeatRow,
                        selected && styles.lockedSeatRowSelected,
                        pressed && !busy && styles.lockedSeatRowPressed,
                      ]}
                    >
                      <View style={[styles.lockedSeatChip, player.seatIndex === 0 && styles.eastSeatChip]}>
                        <AppText
                          style={[styles.lockedSeatChipText, player.seatIndex === 0 && styles.eastSeatChipText]}
                        >
                          {seatLabel}
                        </AppText>
                      </View>
                      <AppText style={styles.lockedPlayerName} numberOfLines={1}>
                        {player.name}
                      </AppText>
                      {player.seatIndex === 0 ? (
                        <AppText style={styles.dealerBadge}>{t('newGame.dealerBadge')}</AppText>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.swapStatus} accessibilityLiveRegion="polite">
                {selectedLockedPlayer ? (
                  <>
                    <AppText style={styles.swapStatusTitle}>
                      {t('gameTable.reseat.selectedPlayer')
                        .replace('{name}', selectedLockedPlayer.name)
                        .replace('{seat}', seatLabels[selectedLockedPlayer.seatIndex] ?? '')}
                    </AppText>
                    <AppText style={styles.swapStatusHint}>{t('gameTable.reseat.selectSecondHint')}</AppText>
                  </>
                ) : (
                  <AppText style={styles.swapStatusHint}>
                    {hasLockedSeatChanges
                      ? t('gameTable.reseat.swapReady')
                      : t('gameTable.reseat.selectFirstHint')}
                  </AppText>
                )}
                {error ? <AppText style={styles.inlineErrorText}>{error}</AppText> : null}
              </View>
            </>
          )}

          <View style={styles.modalActions}>
            <AppButton
              label={t('gameTable.reseat.action.cancel')}
              onPress={() => {
                setModalVisible(false);
                setSelectedLockedPlayerId(null);
                onDismiss();
              }}
              disabled={busy}
              variant="secondary"
              style={styles.secondaryButton}
            />
            <AppButton
              label={
                busy
                  ? t('gameTable.reseat.applying')
                  : allowNameEdit
                    ? t('gameTable.reseat.action.confirm')
                    : t('gameTable.reseat.confirmNewSeats')
              }
              onPress={handleConfirm}
              disabled={busy || (!allowNameEdit && !hasLockedSeatChanges)}
              style={styles.primaryButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const GRID = {
  x0_75: 6,
  x1: 8,
  x1_5: 12,
  x2: 16,
} as const;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(22, 22, 22, 0.28)',
    justifyContent: 'center',
    paddingHorizontal: GRID.x2,
  },
  modalCardLarge: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: GRID.x2,
    paddingVertical: GRID.x2,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  modalSubtitleText: {
    marginTop: GRID.x0_75,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: GRID.x1_5,
    textAlign: 'center',
  },
  reseatScroll: {
    maxHeight: 360,
  },
  reseatScrollContent: {
    paddingBottom: 24,
  },
  swapSubtitle: {
    marginTop: GRID.x0_75,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  swapSteps: {
    marginTop: GRID.x2,
    marginBottom: GRID.x2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GRID.x0_75,
  },
  swapStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  swapStepNumberActive: {
    backgroundColor: theme.colors.primary,
  },
  swapStepNumberText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  swapStepNumberTextActive: {
    color: '#FFFFFF',
  },
  swapStepText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  swapStepTextActive: {
    color: theme.colors.primary,
  },
  swapStepConnector: {
    width: 36,
    height: 1,
    marginHorizontal: GRID.x1,
    backgroundColor: theme.colors.border,
  },
  lockedSeatList: {
    gap: GRID.x1,
  },
  lockedSeatRow: {
    minHeight: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: GRID.x1_5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockedSeatRowSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  lockedSeatRowPressed: {
    opacity: 0.88,
  },
  lockedSeatChip: {
    width: 42,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: '#E6F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: GRID.x1_5,
  },
  lockedSeatChipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  eastSeatChip: {
    borderColor: '#1A73E8',
    backgroundColor: '#E8F0FE',
  },
  eastSeatChipText: {
    color: '#1A73E8',
  },
  lockedPlayerName: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  dealerBadge: {
    marginLeft: GRID.x1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  swapStatus: {
    minHeight: 56,
    marginTop: GRID.x1_5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapStatusTitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: '700',
    textAlign: 'center',
  },
  swapStatusHint: {
    marginTop: 4,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  inlineErrorText: {
    marginTop: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.danger,
    textAlign: 'center',
  },
  modalActions: {
    marginTop: GRID.x2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: GRID.x1,
  },
  secondaryButton: {
    flex: 1,
  },
  primaryButton: {
    flex: 1,
  },
});

export default ReseatFlow;
