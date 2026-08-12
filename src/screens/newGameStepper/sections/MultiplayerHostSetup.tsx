import { Pressable, StyleSheet, View } from 'react-native';
import AppButton from '../../../components/AppButton';
import AppText from '../../../components/AppText';
import Card from '../../../components/Card';
import SegmentedControl from '../../../components/SegmentedControl';
import theme from '../../../theme/theme';
import { GRID } from '../constants';
import { SeatMode, StartingDealerMode } from '../types';

export type MultiplayerHostPlayer = {
  playerId: string;
  displayName: string;
  isHost: boolean;
  isSelf: boolean;
  isTemporary: boolean;
};

export type MultiplayerHostSeat = {
  displayName: string | null;
  isHost: boolean;
  isJoined: boolean;
  isTemporary: boolean;
};

type Props = {
  joinedCount: number;
  hostName: string;
  seatLabels: string[];
  seats: MultiplayerHostSeat[];
  players: MultiplayerHostPlayer[];
  benchPlayerNames: string[];
  selectedPlayerId: string;
  selectedPlayerName: string | null;
  seatMode: SeatMode;
  startingDealerMode: StartingDealerMode;
  startingDealerSourceIndex: number | null;
  autoAssigned: string[] | null;
  disabled: boolean;
  inviteBusy: boolean;
  playersError: string | null;
  labels: {
    shareInvite: string;
    inviteLoading: string;
    joinedCount: string;
    host: string;
    you: string;
    joined: string;
    temporary: string;
    waiting: string;
    seatArrangement: string;
    selectedHint: string;
    selectedHintWithName: string;
    benchTitle: string;
    keepBench: string;
    addTemporary: string;
    seatModeTitle: string;
    seatModeManual: string;
    seatModeAuto: string;
    autoSeatConfirm: string;
    autoSeatReshuffle: string;
    startingDealerRandom: string;
    startingDealerManual: string;
    chooseDealer: string;
    cancelRoom: string;
  };
  onShareInvite: () => void;
  onSelectPlayer: (playerId: string) => void;
  onAssignPlayerToSeat: (index: number) => void;
  onKeepBench: () => void;
  onAddTemporary: () => void;
  onSeatModeChange: (mode: SeatMode) => void;
  onStartingDealerModeChange: (mode: StartingDealerMode) => void;
  onConfirmAutoSeat: () => void;
  onSelectStartingDealer: (index: number) => void;
  onCancelRoom: () => void;
};

function MultiplayerHostSetup({
  joinedCount,
  hostName,
  seatLabels,
  seats,
  players,
  benchPlayerNames,
  selectedPlayerId,
  selectedPlayerName,
  seatMode,
  startingDealerMode,
  startingDealerSourceIndex,
  autoAssigned,
  disabled,
  inviteBusy,
  playersError,
  labels,
  onShareInvite,
  onSelectPlayer,
  onAssignPlayerToSeat,
  onKeepBench,
  onAddTemporary,
  onSeatModeChange,
  onStartingDealerModeChange,
  onConfirmAutoSeat,
  onSelectStartingDealer,
  onCancelRoom,
}: Props) {
  return (
    <View testID="new-game-multiplayer-host-setup">
      <Card style={styles.card}>
        <View style={styles.roomHeader}>
          <View style={styles.roomMetaGroup}>
            <AppText style={styles.roomMeta}>{labels.joinedCount.replace('{count}', String(joinedCount))}</AppText>
            <AppText style={styles.roomMeta}>{labels.host}：{hostName}</AppText>
          </View>
          <AppButton
            label={inviteBusy ? labels.inviteLoading : labels.shareInvite}
            accessibilityLabel={labels.shareInvite}
            onPress={onShareInvite}
            disabled={disabled || inviteBusy}
            variant="secondary"
            style={styles.shareButton}
            testID="new-game-share-invite"
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <AppText style={styles.sectionTitle}>{labels.seatArrangement}</AppText>
        <AppText style={styles.helperText}>
          {selectedPlayerName ? labels.selectedHintWithName.replace('{name}', selectedPlayerName) : labels.selectedHint}
        </AppText>

        <View style={styles.playerChips}>
          {players.map((player) => {
            const selected = player.playerId === selectedPlayerId;
            return (
              <Pressable
                key={player.playerId}
                testID={`new-game-sync-player-${player.playerId}`}
                accessibilityRole="button"
                accessibilityLabel={`${player.displayName}${player.isHost ? ` ${labels.host}` : ''}${player.isSelf ? ` ${labels.you}` : ''}${player.isTemporary ? ` ${labels.temporary}` : ` ${labels.joined}`}`}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onSelectPlayer(player.playerId)}
                style={({ pressed }) => [styles.playerChip, selected && styles.playerChipSelected, pressed && styles.pressed]}
              >
                <AppText style={[styles.playerChipName, selected && styles.playerChipNameSelected]}>{player.displayName}</AppText>
                {player.isHost ? <AppText style={[styles.playerChipMeta, selected && styles.playerChipMetaSelected]}>{labels.host}</AppText> : null}
                {player.isSelf ? <AppText style={[styles.playerChipMeta, selected && styles.playerChipMetaSelected]}>{labels.you}</AppText> : null}
                {player.isTemporary ? <AppText style={[styles.playerChipMeta, selected && styles.playerChipMetaSelected]}>{labels.temporary}</AppText> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.seatsList}>
          {seats.map((seat, index) => {
            const status = seat.isHost
              ? labels.host
              : seat.isJoined
              ? labels.joined
              : seat.isTemporary
              ? labels.temporary
              : labels.waiting;
            const selectable = Boolean(selectedPlayerId) && !disabled;
            const dealerSelectable = seatMode === 'auto' && startingDealerMode === 'manual' && Boolean(autoAssigned) && !disabled;
            const actionAvailable = selectable || dealerSelectable;
            return (
              <Pressable
                key={seatLabels[index]}
                testID={`new-game-sync-seat-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`${seatLabels[index]} ${seat.displayName ?? labels.waiting} ${status}`}
                accessibilityHint={selectable ? labels.selectedHint : undefined}
                accessibilityState={{ disabled: !actionAvailable, selected: startingDealerSourceIndex === index }}
                disabled={!actionAvailable}
                onPress={() => {
                  if (selectable) {
                    onAssignPlayerToSeat(index);
                  } else if (seatMode === 'auto' && startingDealerMode === 'manual' && autoAssigned) {
                    onSelectStartingDealer(index);
                  }
                }}
                style={({ pressed }) => [
                  styles.seatRow,
                  selectable && styles.seatRowSelectable,
                  startingDealerSourceIndex === index && styles.seatRowSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.seatChip, index === 0 && styles.eastSeatChip]}>
                  <AppText style={[styles.seatChipText, index === 0 && styles.eastSeatChipText]}>{seatLabels[index]}</AppText>
                </View>
                <AppText style={[styles.seatName, !seat.displayName && styles.waitingText]}>{seat.displayName ?? labels.waiting}</AppText>
                <AppText style={[styles.status, seat.isHost && styles.hostStatus]}>{status}</AppText>
              </Pressable>
            );
          })}
        </View>

        <AppButton
          testID="new-game-add-temporary-player"
          label={labels.addTemporary}
          accessibilityLabel={labels.addTemporary}
          onPress={onAddTemporary}
          disabled={disabled}
          variant="secondary"
        />

        <View style={styles.modeBlock}>
          <AppText style={styles.inputLabel}>{labels.seatModeTitle}</AppText>
          <SegmentedControl<SeatMode>
            options={[
              { value: 'manual', label: labels.seatModeManual },
              { value: 'auto', label: labels.seatModeAuto },
            ]}
            value={seatMode}
            onChange={onSeatModeChange}
            disabled={disabled}
          />
        </View>

        {seatMode === 'auto' ? (
          <View style={styles.autoBlock}>
            <SegmentedControl<StartingDealerMode>
              options={[
                { value: 'random', label: labels.startingDealerRandom },
                { value: 'manual', label: labels.startingDealerManual },
              ]}
              value={startingDealerMode}
              onChange={onStartingDealerModeChange}
              disabled={disabled}
            />
            <AppButton
              label={autoAssigned ? labels.autoSeatReshuffle : labels.autoSeatConfirm}
              onPress={onConfirmAutoSeat}
              disabled={disabled}
              variant="secondary"
            />
            {autoAssigned && startingDealerMode === 'manual' && startingDealerSourceIndex === null ? (
              <AppText style={styles.helperText}>{labels.chooseDealer}</AppText>
            ) : null}
          </View>
        ) : null}

        {benchPlayerNames.length > 0 ? (
          <View style={styles.benchBlock}>
            <AppText style={styles.inputLabel}>{labels.benchTitle}</AppText>
            <View style={styles.playerChips}>
              {benchPlayerNames.map((name) => (
                <View key={name} style={styles.benchChip}>
                  <AppText style={styles.benchText}>{name}</AppText>
                </View>
              ))}
            </View>
            <AppButton label={labels.keepBench} onPress={onKeepBench} disabled={!selectedPlayerId || disabled} variant="secondary" />
          </View>
        ) : null}

        {playersError ? <AppText style={styles.errorText}>{playersError}</AppText> : null}
      </Card>

      <Pressable
        testID="new-game-cancel-multiplayer-room"
        accessibilityRole="button"
        accessibilityLabel={labels.cancelRoom}
        disabled={disabled}
        onPress={onCancelRoom}
        style={({ pressed }) => [styles.cancelRoom, pressed && styles.pressed]}
      >
        <AppText style={styles.cancelRoomText}>{labels.cancelRoom}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: GRID.x2,
    padding: GRID.x2,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GRID.x2,
  },
  roomMetaGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  shareButton: {
    minWidth: 112,
  },
  roomMeta: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  helperText: {
    marginTop: GRID.x1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  playerChips: {
    marginTop: GRID.x1_5,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID.x1,
  },
  playerChip: {
    minHeight: 44,
    paddingHorizontal: GRID.x1_5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  playerChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  playerChipName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  playerChipNameSelected: {
    color: theme.colors.primaryDark,
  },
  playerChipMeta: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  playerChipMetaSelected: {
    color: theme.colors.primaryDark,
  },
  seatsList: {
    marginTop: GRID.x2,
    marginBottom: GRID.x1,
  },
  seatRow: {
    minHeight: 56,
    marginBottom: GRID.x1_5,
    paddingHorizontal: GRID.x1_5,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  seatRowSelectable: {
    borderColor: theme.colors.primary,
    backgroundColor: '#F7FCFC',
  },
  seatRowSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  seatChip: {
    width: 36,
    height: 32,
    marginRight: GRID.x1_5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: '#E6F5F5',
  },
  seatChipText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  eastSeatChip: {
    borderColor: '#1A73E8',
    backgroundColor: '#E8F0FE',
  },
  eastSeatChipText: {
    color: '#1A73E8',
  },
  seatName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  waitingText: {
    color: theme.colors.textSecondary,
    fontWeight: '400',
  },
  status: {
    marginLeft: GRID.x1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  hostStatus: {
    color: '#9A6300',
  },
  modeBlock: {
    marginTop: GRID.x2,
  },
  inputLabel: {
    marginBottom: GRID.x1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  autoBlock: {
    marginTop: GRID.x1_5,
    gap: GRID.x1_5,
  },
  benchBlock: {
    marginTop: GRID.x2,
    gap: GRID.x1,
  },
  benchChip: {
    minHeight: 36,
    paddingHorizontal: GRID.x1_5,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  benchText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    marginTop: GRID.x1_5,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  cancelRoom: {
    minHeight: 44,
    marginBottom: GRID.x2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelRoomText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});

export default MultiplayerHostSetup;
