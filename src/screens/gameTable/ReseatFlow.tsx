import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const manualPlayerRefs = useRef<Array<TextInput | null>>([]);
  const autoPlayerRefs = useRef<Array<TextInput | null>>([]);
  const hasPromptedRef = useRef(false);

  const seatLabels = useMemo<string[]>(
    () => [t('seat.east'), t('seat.south'), t('seat.west'), t('seat.north')],
    [t],
  );

  useEffect(() => {
    if (!visible) {
      hasPromptedRef.current = false;
      setModalVisible(false);
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

  const handleConfirm = async () => {
    if (busy) {
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
          <Text style={styles.modalTitle}>{t('gameTable.reseat.modalTitle')}</Text>
          <Text style={styles.modalSubtitleText}>{t('gameTable.reseat.modalSubtitle')}</Text>

          <ScrollView
            style={styles.reseatScroll}
            contentContainerStyle={styles.reseatScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <PlayersSection
              allowNameEdit={allowNameEdit}
              seatMode={seatMode}
              seatLabels={seatLabels}
              players={allowNameEdit ? players : lockedPlayers.map((entry) => entry.name)}
              autoNames={autoNames}
              autoAssigned={autoAssigned}
              startingDealerMode={startingDealerMode}
              startingDealerSourceIndex={startingDealerSourceIndex}
              playersError={error}
              disabled={busy}
              manualPlayerRefs={manualPlayerRefs}
              autoPlayerRefs={autoPlayerRefs}
              lockedSeatByRow={allowNameEdit ? undefined : lockedPlayers.map((entry) => entry.seatIndex)}
              labels={{
                sectionTitle: t('newGame.confirmModal.section.players'),
                seatModeTitle: t('newGame.seatModeTitle'),
                seatModeManual: t('newGame.seatMode.manual'),
                seatModeAuto: t('newGame.seatMode.auto'),
                playerManualHintPrefix: allowNameEdit
                  ? t('newGame.playerManualHintPrefix')
                  : t('gameTable.reseat.playerSeatHint'),
                playerManualHintSuffix: allowNameEdit ? t('newGame.playerManualHintSuffix') : '',
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
              onSelectLockedSeat={!allowNameEdit ? handleSelectLockedSeat : undefined}
              onConfirmAutoSeat={handleConfirmReseatAuto}
              onStartingDealerModeChange={(mode) => {
                setStartingDealerMode(mode);
              }}
              onSelectStartingDealer={(index) => setStartingDealerSourceIndex(index)}
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <AppButton
              label={t('gameTable.reseat.action.cancel')}
              onPress={() => {
                setModalVisible(false);
                onDismiss();
              }}
              disabled={busy}
              variant="secondary"
              style={styles.secondaryButton}
            />
            <AppButton
              label={busy ? t('newGame.creating') : t('gameTable.reseat.action.confirm')}
              onPress={handleConfirm}
              disabled={busy}
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
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  modalSubtitleText: {
    marginTop: GRID.x0_75,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: GRID.x1_5,
  },
  reseatScroll: {
    maxHeight: 360,
  },
  reseatScrollContent: {
    paddingBottom: 24,
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
