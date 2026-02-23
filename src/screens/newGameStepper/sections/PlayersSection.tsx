import { RefObject } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '../../../components/AppButton';
import Card from '../../../components/Card';
import SegmentedControl from '../../../components/SegmentedControl';
import theme from '../../../theme/theme';
import { GRID, PLAYER_COUNT } from '../constants';
import { SeatMode, StartingDealerMode } from '../types';

const MAX_PLAYER_NAME_LENGTH = 10;

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
  };
  onSeatModeChange: (nextMode: SeatMode) => void;
  onSetPlayer: (index: number, value: string) => void;
  onSetAutoName: (index: number, value: string) => void;
  lockedSeatByRow?: number[];
  onSelectLockedSeat?: (rowIndex: number, seatIndex: number) => void;
  onConfirmAutoSeat: () => void;
  onStartingDealerModeChange: (mode: StartingDealerMode) => void;
  onSelectStartingDealer: (index: number) => void;
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
  lockedSeatByRow,
  onSelectLockedSeat,
  onConfirmAutoSeat,
  onStartingDealerModeChange,
  onSelectStartingDealer,
}: Props) {
  const effectiveSeatMode: SeatMode = allowNameEdit ? seatMode : 'manual';
  const dealerResultIndex = startingDealerSourceIndex;
  const hasDealerResult = dealerResultIndex !== null && dealerResultIndex >= 0 && dealerResultIndex < PLAYER_COUNT;
  const dealerSeatLabel = hasDealerResult ? seatLabels[dealerResultIndex] : '';
  const dealerPlayerName = hasDealerResult && autoAssigned ? autoAssigned[dealerResultIndex] : '';
  const southSeatIndex = hasDealerResult ? (dealerResultIndex + 1) % PLAYER_COUNT : null;
  const southSeatLabel = southSeatIndex !== null ? seatLabels[southSeatIndex] : '';
  const southPlayerName = southSeatIndex !== null && autoAssigned ? autoAssigned[southSeatIndex] : '';

  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{labels.sectionTitle}</Text>
      {seatMode === 'manual' ? <Text style={styles.captionText}>{labels.manualSeatCaption}</Text> : null}

      {allowNameEdit ? (
        <>
          <Text style={styles.inputLabel}>{labels.seatModeTitle}</Text>
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
          <Text style={styles.helperText}>
            {allowNameEdit
              ? `${labels.playerManualHintPrefix}${PLAYER_COUNT}${labels.playerManualHintSuffix}`
              : labels.playerManualHintPrefix}
          </Text>
          {seatLabels.map((label, index) => (
            <View key={label} style={styles.playerRowCard}>
              {!allowNameEdit && onSelectLockedSeat ? (
                <Pressable
                  testID={`reseat-seat-picker-${index}`}
                  onPress={() => {
                    if (disabled) {
                      return;
                    }
                    Alert.alert(
                      labels.seatModeTitle,
                      undefined,
                      seatLabels.map((seatLabel, seatIndex) => ({
                        text: seatLabel,
                        onPress: () => onSelectLockedSeat(index, seatIndex),
                      })),
                      { cancelable: true },
                    );
                  }}
                  style={styles.seatChip}
                >
                  <Text style={styles.seatChipText}>
                    {seatLabels[lockedSeatByRow?.[index] ?? index]}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.seatChip}>
                  <Text style={styles.seatChipText}>{label}</Text>
                </View>
              )}
              {allowNameEdit ? (
                <TextInput
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
                <Text style={styles.playerReadonlyText}>
                  {players[index]}
                </Text>
              )}
              {index === 0 ? <Text style={styles.dealerBadge}>{labels.dealerBadge}</Text> : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.playersList}>
          <Text style={styles.helperText}>{labels.autoFlowHint}</Text>
          {autoNames.map((value, index) => (
            <View key={`auto-${index}`} style={styles.playerRowCard}>
              <View style={styles.seatChip}>
                <Text style={styles.seatChipText}>{index + 1}</Text>
              </View>
              <TextInput
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
            </View>
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
              <Text style={styles.inputLabel}>
                {startingDealerMode === 'manual' ? labels.autoSeatResultManualTitle : labels.autoSeatResult}
              </Text>
              {seatLabels.map((label, index) => (
                <Pressable
                  key={`result-${label}`}
                  onPress={() => {
                    if (disabled || startingDealerMode !== 'manual') {
                      return;
                    }
                    onSelectStartingDealer(index);
                  }}
                  style={({ pressed }) => [
                    styles.playerRowCard,
                    startingDealerMode === 'manual' ? styles.selectableRow : null,
                    startingDealerMode === 'manual' && startingDealerSourceIndex === index ? styles.selectedDealerRow : null,
                    pressed && startingDealerMode === 'manual' ? styles.pressedDealerRow : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: disabled || startingDealerMode !== 'manual',
                    selected: startingDealerSourceIndex === index,
                  }}
                  hitSlop={6}
                >
                  <View style={styles.seatChip}>
                    <Text style={styles.seatChipText}>{label}</Text>
                  </View>
                  <Text style={styles.resultText}>{autoAssigned[index]}</Text>
                  {startingDealerSourceIndex === index ? <Text style={styles.dealerBadge}>{labels.dealerBadge}</Text> : null}
                </Pressable>
              ))}
              <Text style={styles.resultHintText}>{labels.autoSeatResultHint}</Text>
              {hasDealerResult ? (
                <Text style={styles.resultHintText}>
                  {labels.autoSeatDealerExample
                    .replace('{dealerSeatLabel}', dealerSeatLabel)
                    .replace('{dealerPlayerName}', dealerPlayerName)
                    .replace('{southSeatLabel}', southSeatLabel)
                    .replace('{southPlayerName}', southPlayerName)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
      {playersError ? <Text style={styles.inlineErrorText}>{playersError}</Text> : null}
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
    flex: 1,
    minHeight: 44,
    textAlignVertical: 'center',
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
});

export default PlayersSection;
