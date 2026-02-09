import { RefObject } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '../../../components/AppButton';
import Card from '../../../components/Card';
import SegmentedControl from '../../../components/SegmentedControl';
import theme from '../../../theme/theme';
import { GRID, PLAYER_COUNT } from '../constants';
import { SeatMode } from '../types';

type Props = {
  seatMode: SeatMode;
  seatLabels: string[];
  players: string[];
  autoNames: string[];
  autoAssigned: string[] | null;
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
  };
  onSeatModeChange: (nextMode: SeatMode) => void;
  onSetPlayer: (index: number, value: string) => void;
  onSetAutoName: (index: number, value: string) => void;
  onConfirmAutoSeat: () => void;
};

function PlayersSection({
  seatMode,
  seatLabels,
  players,
  autoNames,
  autoAssigned,
  playersError,
  disabled,
  manualPlayerRefs,
  autoPlayerRefs,
  labels,
  onSeatModeChange,
  onSetPlayer,
  onSetAutoName,
  onConfirmAutoSeat,
}: Props) {
  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{labels.sectionTitle}</Text>

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

      {seatMode === 'manual' ? (
        <View style={styles.playersList}>
          <Text style={styles.helperText}>
            {`${labels.playerManualHintPrefix}${PLAYER_COUNT}${labels.playerManualHintSuffix}`}
          </Text>
          {seatLabels.map((label, index) => (
            <View key={label} style={styles.playerRowCard}>
              <View style={styles.seatChip}>
                <Text style={styles.seatChipText}>{label}</Text>
              </View>
              <TextInput
                ref={(ref) => {
                  manualPlayerRefs.current[index] = ref;
                }}
                style={styles.playerInput}
                value={players[index]}
                onChangeText={(value) => onSetPlayer(index, value)}
                placeholder={`${label}${labels.playerNameBySeatSuffix}`}
                placeholderTextColor={theme.colors.textSecondary}
                editable={!disabled}
                returnKeyType={index === 3 ? 'done' : 'next'}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.playersList}>
          <Text style={styles.helperText}>
            {`${labels.playerAutoHintPrefix}${PLAYER_COUNT}${labels.playerAutoHintSuffix}`}
          </Text>
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
                onChangeText={(next) => onSetAutoName(index, next)}
                placeholder={`${labels.playerOrderPrefix}${index + 1}${labels.playerOrderSuffix}`}
                placeholderTextColor={theme.colors.textSecondary}
                editable={!disabled}
                returnKeyType={index === 3 ? 'done' : 'next'}
              />
            </View>
          ))}

          <AppButton
            label={autoAssigned ? labels.autoSeatReshuffle : labels.autoSeatConfirm}
            onPress={onConfirmAutoSeat}
            disabled={disabled}
            variant="secondary"
          />

          {autoAssigned ? (
            <View style={styles.blockSpacing}>
              <Text style={styles.inputLabel}>{labels.autoSeatResult}</Text>
              {seatLabels.map((label, index) => (
                <View key={`result-${label}`} style={styles.playerRowCard}>
                  <View style={styles.seatChip}>
                    <Text style={styles.seatChipText}>{label}</Text>
                  </View>
                  <Text style={styles.resultText}>{autoAssigned[index]}</Text>
                </View>
              ))}
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
  resultText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  inlineErrorText: {
    marginTop: GRID.x1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
});

export default PlayersSection;
