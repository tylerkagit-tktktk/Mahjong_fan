import { RefObject } from 'react';
import AppTextInput from '../../../components/AppTextInput';
import AppText from '../../../components/AppText';
import { Alert, LayoutChangeEvent, Pressable, StyleSheet, TextInput, View } from 'react-native';
import AppButton from '../../../components/AppButton';
import Card from '../../../components/Card';
import SegmentedControl from '../../../components/SegmentedControl';
import theme from '../../../theme/theme';
import { GRID, PLAYER_COUNT } from '../constants';
import { SeatMode, StartingDealerMode } from '../types';

const MAX_PLAYER_NAME_LENGTH = 10;

type SyncPlayerChip = {
  playerId: string;
  displayName: string;
  isHost: boolean;
  isSelf: boolean;
  assignedSeatLabel?: string | null;
};

type Props = {
  allowNameEdit?: boolean;
  seatMode: SeatMode;
  seatLabels: string[];
  players: string[];
  autoNames: string[];
  autoAssigned: string[] | null;
  startingDealerMode: StartingDealerMode;
  startingDealerSourceIndex: number | null;
  playersError: string | null;
  disabled: boolean;
  manualPlayerRefs: RefObject<Array<TextInput | null>>;
  autoPlayerRefs: RefObject<Array<TextInput | null>>;
  labels: {
    sectionTitle: string;
    seatModeTitle: string;
    seatModeManual: string;
    seatModeAuto: string;
    playerManualHintPrefix: string;
    playerManualHintSuffix: string;
    playerAutoHintPrefix: string;
    playerAutoHintSuffix: string;
    playerNameBySeatSuffix: string;
    playerOrderPrefix: string;
    playerOrderSuffix: string;
    autoSeatConfirm: string;
    autoSeatReshuffle: string;
    autoSeatResult: string;
    autoSeatResultManualTitle: string;
    autoSeatResultHint: string;
    autoSeatDealerExample: string;
    manualSeatCaption: string;
    startingDealerModeRandom: string;
    startingDealerModeManual: string;
    autoFlowHint: string;
    dealerBadge: string;
    syncEnable?: string;
    syncEnableBusy?: string;
    syncJoinedPlayersTitle?: string;
    syncJoinedPlayersHint?: string;
    syncSelectedPlayerHint?: string;
    syncSelectedPlayerHintWithName?: string;
    syncSeatAssigned?: string;
    syncBenchTitle?: string;
    syncKeepBench?: string;
    syncYou?: string;
    syncHost?: string;
  };
  onSeatModeChange: (nextMode: SeatMode) => void;
  onSetPlayer: (index: number, value: string) => void;
  onSetAutoName: (index: number, value: string) => void;
  onConfirmAutoSeat: () => void;
  onStartingDealerModeChange: (mode: StartingDealerMode) => void;
  onSelectStartingDealer: (index: number) => void;
  syncEnabled?: boolean;
  syncBusy?: boolean;
  syncedSeatDisplayNames?: Array<string | null>;
  joinedSyncPlayers?: SyncPlayerChip[];
  selectedSyncPlayerId?: string;
  selectedSyncPlayerName?: string | null;
  benchPlayerNames?: string[];
  onEnableSync?: () => void;
  onSelectSyncPlayer?: (playerId: string) => void;
  onAssignSyncPlayerToSeat?: (seatIndex: number) => void;
  onKeepSyncPlayerOnBench?: () => void;
  onPlayersErrorLayout?: (event: LayoutChangeEvent) => void;
};

function PlayersSection({
  allowNameEdit = true,
  seatMode,
  seatLabels,
  players,
  autoNames,
  autoAssigned,
  startingDealerMode,
  startingDealerSourceIndex,
  playersError,
  disabled,
  manualPlayerRefs,
  autoPlayerRefs,
  labels,
  onSeatModeChange,
  onSetPlayer,
  onSetAutoName,
  onConfirmAutoSeat,
  onStartingDealerModeChange,
  onSelectStartingDealer,
  syncEnabled = false,
  syncBusy = false,
  syncedSeatDisplayNames = [],
  joinedSyncPlayers = [],
  selectedSyncPlayerId,
  selectedSyncPlayerName,
  benchPlayerNames = [],
  onEnableSync,
  onSelectSyncPlayer,
  onAssignSyncPlayerToSeat,
  onKeepSyncPlayerOnBench,
  onPlayersErrorLayout,
}: Props) {
  const effectiveSeatMode: SeatMode = allowNameEdit ? seatMode : 'manual';
  const dealerResultIndex = startingDealerSourceIndex;
  const hasDealerResult = dealerResultIndex !== null && dealerResultIndex >= 0 && dealerResultIndex < PLAYER_COUNT;
  const dealerSeatLabel = hasDealerResult ? seatLabels[dealerResultIndex] : '';
  const dealerPlayerName = hasDealerResult && autoAssigned ? autoAssigned[dealerResultIndex] : '';
  const southSeatIndex = hasDealerResult ? (dealerResultIndex + 1) % PLAYER_COUNT : null;
  const southSeatLabel = southSeatIndex !== null ? seatLabels[southSeatIndex] : '';
  const southPlayerName = southSeatIndex !== null && autoAssigned ? autoAssigned[southSeatIndex] : '';

  const renderSyncSeatBadge = (index: number) => {
    if (!syncedSeatDisplayNames[index]) {
      return null;
    }
    return (
      <View style={styles.syncSeatBadge}>
        <AppText style={styles.syncSeatBadgeText}>{labels.syncSeatAssigned ?? '已同步'}</AppText>
      </View>
    );
  };

  const syncAutoSeatSelectable = syncEnabled && Boolean(selectedSyncPlayerId) && Boolean(onAssignSyncPlayerToSeat);

  const renderManualSeatRow = (label: string, index: number) => {
    const syncedDisplayName = syncedSeatDisplayNames[index];
    const syncSeatSelectable = syncEnabled && Boolean(selectedSyncPlayerId) && Boolean(onAssignSyncPlayerToSeat);
    const handleAssignSeat = () => {
      if (!syncSeatSelectable || !onAssignSyncPlayerToSeat) {
        return;
      }
      onAssignSyncPlayerToSeat(index);
    };

    return (
      <Pressable
        key={label}
        onPress={handleAssignSeat}
        disabled={!syncSeatSelectable}
        style={({ pressed }) => [
          styles.playerRowCard,
          syncSeatSelectable ? styles.syncSelectableRow : null,
          pressed && syncSeatSelectable ? styles.syncSelectableRowPressed : null,
        ]}
      >
        <View
          style={[
            styles.seatChip,
            index === 0 && styles.eastSeatChip,
            syncSeatSelectable ? styles.seatChipSelectable : null,
          ]}
        >
          <AppText style={[styles.seatChipText, index === 0 && styles.eastSeatChipText]}>{label}</AppText>
        </View>
        {syncedDisplayName ? (
          <View style={styles.playerReadonlyWrap}>
            <AppText style={styles.playerReadonlyText}>{syncedDisplayName}</AppText>
          </View>
        ) : allowNameEdit ? (
          <AppTextInput
            ref={(ref) => {
              manualPlayerRefs.current[index] = ref;
            }}
            style={styles.playerInput}
            value={players[index]}
            onChangeText={(value) => onSetPlayer(index, value.slice(0, MAX_PLAYER_NAME_LENGTH))}
            placeholder={`${label}${labels.playerNameBySeatSuffix}`}
            placeholderTextColor={theme.colors.textSecondary}
            editable={!disabled}
            maxLength={MAX_PLAYER_NAME_LENGTH}
            returnKeyType={index === 3 ? 'done' : 'next'}
          />
        ) : (
          <View style={styles.playerReadonlyWrap}>
            <AppText style={styles.playerReadonlyText}>
              {players[index]}
            </AppText>
          </View>
        )}
        {renderSyncSeatBadge(index)}
        {index === 0 ? <AppText style={styles.dealerBadge}>{labels.dealerBadge}</AppText> : null}
      </Pressable>
    );
  };

  return (
    <Card style={styles.card}>
      <AppText style={styles.sectionTitle}>{labels.sectionTitle}</AppText>
      {seatMode === 'manual' ? <AppText style={styles.captionText}>{labels.manualSeatCaption}</AppText> : null}

      {allowNameEdit ? (
        <>
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
        </>
      ) : null}

      {effectiveSeatMode === 'manual' ? (
        <View style={styles.playersList}>
          <AppText style={styles.helperText}>
            {allowNameEdit
              ? `${labels.playerManualHintPrefix}${PLAYER_COUNT}${labels.playerManualHintSuffix}`
              : labels.playerManualHintPrefix}
          </AppText>
          {playersError ? (
            <AppText onLayout={onPlayersErrorLayout} style={styles.inlineErrorText}>
              {playersError}
            </AppText>
          ) : null}
          {seatLabels.map(renderManualSeatRow)}
        </View>
      ) : (
        <View style={styles.playersList}>
          <AppText style={styles.helperText}>
            {syncEnabled && selectedSyncPlayerId
              ? '已選同步玩家。請先按「確認抽籤」，再點東南西北安排上枱。'
              : labels.autoFlowHint}
          </AppText>
          {playersError ? (
            <AppText onLayout={onPlayersErrorLayout} style={styles.inlineErrorText}>
              {playersError}
            </AppText>
          ) : null}
          {autoNames.map((value, index) => (
            <Pressable
              key={`auto-${index}`}
              onPress={() => {
                if (!syncEnabled || !selectedSyncPlayerId || autoAssigned) {
                  return;
                }
                Alert.alert('請先確認抽籤', '自動編位要先產生東南西北結果，之後先可以安排同步玩家上枱。');
              }}
              disabled={!syncEnabled || !selectedSyncPlayerId || Boolean(autoAssigned)}
              style={({ pressed }) => [
                styles.playerRowCard,
                syncEnabled && selectedSyncPlayerId && !autoAssigned ? styles.syncSelectableRow : null,
                pressed && syncEnabled && selectedSyncPlayerId && !autoAssigned ? styles.syncSelectableRowPressed : null,
              ]}
            >
                  <View style={[styles.seatChip, index === 0 && styles.eastSeatChip]}>
                    <AppText style={[styles.seatChipText, index === 0 && styles.eastSeatChipText]}>{index + 1}</AppText>
              </View>
              <AppTextInput
                ref={(ref) => {
                  autoPlayerRefs.current[index] = ref;
                }}
                style={styles.playerInput}
                value={value}
                onChangeText={(next) => onSetAutoName(index, next.slice(0, MAX_PLAYER_NAME_LENGTH))}
                placeholder={`${labels.playerOrderPrefix}${index + 1}${labels.playerOrderSuffix}`}
                placeholderTextColor={theme.colors.textSecondary}
                editable={!disabled}
                maxLength={MAX_PLAYER_NAME_LENGTH}
                returnKeyType={index === 3 ? 'done' : 'next'}
              />
            </Pressable>
          ))}

          <View style={styles.blockSpacing}>
            <SegmentedControl<StartingDealerMode>
              options={[
                { value: 'random', label: labels.startingDealerModeRandom },
                { value: 'manual', label: labels.startingDealerModeManual },
              ]}
              value={startingDealerMode}
              onChange={onStartingDealerModeChange}
              disabled={disabled}
            />
          </View>

          <View style={styles.confirmButtonSpacing}>
            <AppButton
              label={autoAssigned ? labels.autoSeatReshuffle : labels.autoSeatConfirm}
              onPress={onConfirmAutoSeat}
              disabled={disabled}
              variant="secondary"
            />
          </View>

          {autoAssigned ? (
            <View style={styles.blockSpacing}>
              <AppText style={styles.inputLabel}>
                {startingDealerMode === 'manual' ? labels.autoSeatResultManualTitle : labels.autoSeatResult}
              </AppText>
              {seatLabels.map((label, index) => (
                <Pressable
                  key={`result-${label}`}
                  onPress={() => {
                    if (syncEnabled && onAssignSyncPlayerToSeat && selectedSyncPlayerId) {
                      onAssignSyncPlayerToSeat(index);
                      return;
                    }
                    if (disabled || startingDealerMode !== 'manual') {
                      return;
                    }
                    onSelectStartingDealer(index);
                  }}
                  style={({ pressed }) => [
                    styles.playerRowCard,
                    startingDealerMode === 'manual' || syncAutoSeatSelectable ? styles.selectableRow : null,
                    startingDealerMode === 'manual' && startingDealerSourceIndex === index ? styles.selectedDealerRow : null,
                    syncAutoSeatSelectable ? styles.syncSelectableRow : null,
                    pressed && (startingDealerMode === 'manual' || syncAutoSeatSelectable) ? styles.pressedDealerRow : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: disabled || (!syncAutoSeatSelectable && startingDealerMode !== 'manual'),
                    selected: startingDealerSourceIndex === index,
                  }}
                  hitSlop={6}
                >
                  <View style={[styles.seatChip, index === 0 && styles.eastSeatChip]}>
                    <AppText style={[styles.seatChipText, index === 0 && styles.eastSeatChipText]}>{label}</AppText>
                  </View>
                  <AppText style={styles.resultText}>{syncedSeatDisplayNames[index] ?? autoAssigned[index]}</AppText>
                  {renderSyncSeatBadge(index)}
                  {startingDealerSourceIndex === index ? <AppText style={styles.dealerBadge}>{labels.dealerBadge}</AppText> : null}
                </Pressable>
              ))}
              <AppText style={styles.resultHintText}>
                {startingDealerMode === 'manual' && !hasDealerResult
                  ? '請點選其中一位做莊，系統會即時排成最終東南西北座位。'
                  : syncedSeatDisplayNames.some(Boolean)
                  ? '抽籤結果已自動同步上枱；如要調整，可以再點玩家同座位覆蓋安排。'
                  : '抽籤結果已按最終東南西北顯示。'}
              </AppText>
              {hasDealerResult && !syncedSeatDisplayNames.some(Boolean) ? (
                <AppText style={styles.resultHintText}>
                  {labels.autoSeatDealerExample
                    .replace('{dealerSeatLabel}', dealerSeatLabel)
                    .replace('{dealerPlayerName}', dealerPlayerName)
                    .replace('{southSeatLabel}', southSeatLabel)
                    .replace('{southPlayerName}', southPlayerName)}
                </AppText>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      {syncEnabled ? (
        <View style={styles.syncBlock}>
          <AppText style={styles.inputLabel}>{labels.syncJoinedPlayersTitle ?? '已加入玩家'}</AppText>
          <AppText style={styles.syncHintText}>
            {selectedSyncPlayerName
              ? (labels.syncSelectedPlayerHintWithName ?? '已選 {name}').replace('{name}', selectedSyncPlayerName)
              : labels.syncSelectedPlayerHint ?? '點選一位已加入玩家，再點東南西北其中一格安排上枱。'}
          </AppText>
          {joinedSyncPlayers.length > 0 ? (
            <View style={styles.syncPlayerChipList}>
              {joinedSyncPlayers.map((player) => {
                const selected = selectedSyncPlayerId === player.playerId;
                return (
                  <Pressable
                    key={player.playerId}
                    onPress={() => onSelectSyncPlayer?.(player.playerId)}
                    style={[styles.syncPlayerChip, selected && styles.syncPlayerChipSelected]}
                  >
                    <AppText style={[styles.syncPlayerChipText, selected && styles.syncPlayerChipTextSelected]}>
                      {player.displayName}
                    </AppText>
                    {player.isHost ? <AppText style={[styles.syncPlayerMeta, selected && styles.syncPlayerMetaSelected]}>{labels.syncHost ?? '房主'}</AppText> : null}
                    {player.isSelf ? <AppText style={[styles.syncPlayerMeta, selected && styles.syncPlayerMetaSelected]}>{labels.syncYou ?? '你'}</AppText> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <AppText style={styles.syncHintText}>{labels.syncJoinedPlayersHint ?? '其他玩家加入後，會出現在這裡供你安排到座位或留在後備。'}</AppText>
          )}

          {benchPlayerNames.length > 0 ? (
            <View style={styles.benchBlock}>
              <AppText style={styles.inputLabel}>{labels.syncBenchTitle ?? '後備區'}</AppText>
              <View style={styles.syncPlayerChipList}>
                {benchPlayerNames.map((playerName) => (
                  <View key={playerName} style={styles.benchChip}>
                    <AppText style={styles.benchChipText}>{playerName}</AppText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.keepBenchButtonWrap}>
            <AppButton
              label={labels.syncKeepBench ?? '留在後備'}
              onPress={() => onKeepSyncPlayerOnBench?.()}
              disabled={!selectedSyncPlayerId || disabled}
              variant="secondary"
            />
          </View>
        </View>
      ) : (
        <View style={styles.syncBlock}>
          <AppButton
            label={syncBusy ? labels.syncEnableBusy ?? '建立同步房中...' : labels.syncEnable ?? '加入同步玩家'}
            onPress={() => onEnableSync?.()}
            disabled={disabled || syncBusy}
            variant="secondary"
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: GRID.x2,
    padding: GRID.x2,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: GRID.x1_5,
  },
  captionText: {
    marginTop: -2,
    marginBottom: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  inputLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: GRID.x1,
  },
  playersList: {
    marginTop: GRID.x1,
  },
  helperText: {
    marginTop: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  playerRowCard: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GRID.x1_5,
    marginBottom: GRID.x1_5,
  },
  seatChip: {
    minWidth: 40,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E6F5F5',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: GRID.x1_5,
  },
  seatChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  eastSeatChip: {
    backgroundColor: '#E8F0FE',
    borderColor: '#1A73E8',
  },
  eastSeatChipText: {
    color: '#1A73E8',
  },
  seatChipSelectable: {
    backgroundColor: theme.colors.primaryLight,
  },
  playerInput: {
    flex: 1,
    minHeight: 44,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  blockSpacing: {
    marginTop: GRID.x1_5,
  },
  confirmButtonSpacing: {
    marginTop: GRID.x2,
  },
  resultText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  selectableRow: {
    borderColor: theme.colors.border,
  },
  syncSelectableRow: {
    borderColor: theme.colors.primary,
    backgroundColor: '#F7FCFC',
  },
  syncSelectableRowPressed: {
    opacity: 0.92,
  },
  selectedDealerRow: {
    borderColor: theme.colors.primary,
    backgroundColor: '#F2FAFA',
  },
  pressedDealerRow: {
    opacity: 0.9,
  },
  dealerBadge: {
    marginLeft: GRID.x1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  inlineErrorText: {
    marginTop: GRID.x1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  resultHintText: {
    marginTop: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  playerReadonlyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  playerReadonlyWrap: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  syncBlock: {
    marginTop: GRID.x2,
  },
  syncHintText: {
    marginTop: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  syncPlayerChipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID.x1,
    marginTop: GRID.x1_5,
  },
  syncPlayerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: GRID.x1_5,
    paddingVertical: GRID.x1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  syncPlayerChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  syncPlayerChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  syncPlayerChipTextSelected: {
    color: theme.colors.primaryDark,
  },
  syncPlayerMeta: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  syncPlayerMetaSelected: {
    color: theme.colors.primaryDark,
  },
  syncSeatBadge: {
    marginLeft: GRID.x1,
    paddingHorizontal: GRID.x1,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryLight,
  },
  syncSeatBadgeText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.primaryDark,
    fontWeight: '700',
  },
  benchBlock: {
    marginTop: GRID.x2,
  },
  benchChip: {
    paddingHorizontal: GRID.x1_5,
    paddingVertical: GRID.x1,
    borderRadius: 999,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  benchChipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
  },
  keepBenchButtonWrap: {
    marginTop: GRID.x2,
  },
});

export default PlayersSection;
