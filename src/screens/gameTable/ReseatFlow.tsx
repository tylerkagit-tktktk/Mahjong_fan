import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '../../components/AppButton';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import theme from '../../theme/theme';
import { shuffle } from '../newGameStepper/helpers';
import { PLAYER_COUNT } from '../newGameStepper/constants';
import PlayersSection from '../newGameStepper/sections/PlayersSection';
import { SeatMode, StartingDealerMode } from '../newGameStepper/types';

type PlayerSeatEntry = {
  id: string;
  name: string;
};

type Props = {
  visible: boolean;
  currentRoundLabelZh: string;
  handsCount: number;
  currentDealerSeatIndex: number;
  currentPlayersBySeat: PlayerSeatEntry[];
  onDismiss: () => void;
  onApplyReseat: (seatConfig: { rotationDelta: number }) => Promise<void>;
};

function ReseatFlow({
  visible,
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
            const names = currentPlayersBySeat.map((entry) => entry.name);
            setPlayers(names);
            setAutoNames(names);
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
    const usedIndices = new Set<number>();
    const selectedIds: string[] = [];

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

    let rotationDelta: number | null = null;
    for (let delta = 0; delta < 4; delta += 1) {
      const isMatch = selectedIds.every((id, seatIndex) => id === currentIds[(seatIndex - delta + 4) % 4]);
      if (isMatch) {
        rotationDelta = delta;
        break;
      }
    }

    if (rotationDelta == null) {
      setError(t('gameTable.reseat.unsupported'));
      return;
    }

    setBusy(true);
    try {
      await onApplyReseat({ rotationDelta });
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
      <Pressable style={styles.modalOverlay} onPress={() => (!busy ? (setModalVisible(false), onDismiss()) : undefined)}>
        <Pressable style={styles.modalCardLarge} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>{t('gameTable.reseat.modalTitle')}</Text>
          <Text style={styles.modalSubtitleText}>{t('gameTable.reseat.modalSubtitle')}</Text>

          <ScrollView style={styles.reseatScroll} contentContainerStyle={styles.reseatScrollContent}>
            <PlayersSection
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
                  next[index] = value;
                  return next;
                });
              }}
              onSetAutoName={(index, value) => {
                setAutoNames((prev) => {
                  const next = [...prev];
                  next[index] = value;
                  return next;
                });
              }}
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
        </Pressable>
      </Pressable>
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
    paddingBottom: GRID.x1,
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
