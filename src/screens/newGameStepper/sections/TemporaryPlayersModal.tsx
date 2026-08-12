import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AppButton from '../../../components/AppButton';
import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import theme from '../../../theme/theme';
import { GRID } from '../constants';

type Props = {
  visible: boolean;
  values: string[];
  seatLabels: string[];
  assignedPlayerNames: Array<string | null>;
  labels: {
    title: string;
    message: string;
    inputSuffix: string;
    joined: string;
    cancel: string;
    save: string;
  };
  onCancel: () => void;
  onSave: (values: string[]) => void;
};

function TemporaryPlayersModal({
  visible,
  values,
  seatLabels,
  assignedPlayerNames,
  labels,
  onCancel,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(values);

  useEffect(() => {
    if (visible) {
      setDraft(values.slice(0, 4));
    }
  }, [values, visible]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel={labels.cancel} onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View testID="new-game-temporary-players-modal" style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <AppText style={styles.title}>{labels.title}</AppText>
          <AppText style={styles.message}>{labels.message}</AppText>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            {seatLabels.map((seatLabel, index) => {
              const assignedName = assignedPlayerNames[index];
              return (
                <View key={seatLabel} style={styles.row}>
                  <View style={[styles.seatChip, index === 0 && styles.eastSeatChip]}>
                    <AppText style={[styles.seatChipText, index === 0 && styles.eastSeatChipText]}>{seatLabel}</AppText>
                  </View>
                  {assignedName ? (
                    <View style={styles.assignedWrap}>
                      <AppText style={styles.assignedName}>{assignedName}</AppText>
                      <AppText style={styles.assignedStatus}>{labels.joined}</AppText>
                    </View>
                  ) : (
                    <AppTextInput
                      testID={`new-game-temporary-player-${index}`}
                      style={styles.input}
                      value={draft[index] ?? ''}
                      onChangeText={(value) => {
                        const next = [...draft];
                        next[index] = value.slice(0, 10);
                        setDraft(next);
                      }}
                      placeholder={`${seatLabel}${labels.inputSuffix}`}
                      accessibilityLabel={`${seatLabel}${labels.inputSuffix}`}
                      placeholderTextColor={theme.colors.textSecondary}
                      maxLength={10}
                      returnKeyType={index === 3 ? 'done' : 'next'}
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <AppButton label={labels.cancel} onPress={onCancel} variant="secondary" style={styles.footerButton} />
            <AppButton testID="new-game-save-temporary-players" label={labels.save} onPress={() => onSave(draft)} style={styles.footerButton} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(31, 41, 38, 0.42)',
  },
  sheet: {
    maxHeight: '88%',
    paddingTop: GRID.x1,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    backgroundColor: theme.colors.background,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  title: {
    marginTop: GRID.x2,
    paddingHorizontal: GRID.x2,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    marginTop: GRID.x1,
    paddingHorizontal: GRID.x2,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
  content: {
    padding: GRID.x2,
    gap: GRID.x1_5,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GRID.x1_5,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
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
  input: {
    flex: 1,
    minHeight: 44,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
  },
  assignedWrap: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  assignedName: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  assignedStatus: {
    marginTop: 2,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  footer: {
    flexDirection: 'row',
    gap: GRID.x1_5,
    paddingHorizontal: GRID.x2,
    paddingTop: GRID.x1_5,
    paddingBottom: GRID.x2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  footerButton: {
    flex: 1,
  },
});

export default TemporaryPlayersModal;
