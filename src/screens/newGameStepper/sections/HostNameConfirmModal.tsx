import { Modal, Pressable, StyleSheet, View } from 'react-native';
import AppButton from '../../../components/AppButton';
import AppText from '../../../components/AppText';
import AppTextInput from '../../../components/AppTextInput';
import theme from '../../../theme/theme';
import { typography } from '../../../styles/typography';

type Props = {
  visible: boolean;
  value: string;
  busy: boolean;
  error: string | null;
  labels: {
    title: string;
    message: string;
    inputLabel: string;
    placeholder: string;
    cancel: string;
    confirm: string;
    confirming: string;
  };
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function HostNameConfirmModal({ visible, value, busy, error, labels, onChange, onCancel, onConfirm }: Props) {
  const valid = value.trim().length >= 1 && value.trim().length <= 10;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onCancel} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <AppText style={styles.title}>{labels.title}</AppText>
          <AppText style={styles.message}>{labels.message}</AppText>
          <AppText style={styles.label}>{labels.inputLabel}</AppText>
          <AppTextInput
            testID="sync-host-name-input"
            autoFocus
            value={value}
            onChangeText={(next) => onChange(next.slice(0, 10))}
            editable={!busy}
            maxLength={10}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (valid && !busy) onConfirm();
            }}
            placeholder={labels.placeholder}
            placeholderTextColor={theme.colors.textSecondary}
            style={styles.input}
          />
          {error ? <AppText style={styles.error}>{error}</AppText> : null}
          <View style={styles.actions}>
            <View style={styles.action}>
              <AppButton label={labels.cancel} onPress={onCancel} disabled={busy} variant="secondary" />
            </View>
            <View style={styles.action}>
              <AppButton
                label={busy ? labels.confirming : labels.confirm}
                onPress={onConfirm}
                disabled={!valid || busy}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  sheet: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  title: { ...typography.subtitle, color: theme.colors.textPrimary },
  message: { ...typography.body, color: theme.colors.textSecondary },
  label: { ...typography.caption, marginTop: theme.spacing.xs, color: theme.colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
  },
  error: { ...typography.caption, color: theme.colors.danger },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  action: { flex: 1 },
});

export default HostNameConfirmModal;
