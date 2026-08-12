import { Modal, Pressable, StyleSheet, View } from 'react-native';
import AppButton from '../../../components/AppButton';
import AppText from '../../../components/AppText';
import theme from '../../../theme/theme';
import { GRID } from '../constants';

type Props = {
  visible: boolean;
  busy: boolean;
  labels: {
    title: string;
    message: string;
    invite: string;
    returnLocal: string;
    cancel: string;
  };
  onInvite: () => void;
  onReturnLocal: () => void;
  onCancel: () => void;
};

function InsufficientPlayersModal({ visible, busy, labels, onInvite, onReturnLocal, onCancel }: Props) {
  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel={labels.cancel} onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View testID="new-game-insufficient-players-modal" style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconWrap}>
            <AppText accessibilityElementsHidden style={styles.icon}>2+</AppText>
          </View>
          <AppText style={styles.title}>{labels.title}</AppText>
          <AppText style={styles.message}>{labels.message}</AppText>
          <AppButton testID="new-game-insufficient-invite" label={labels.invite} onPress={onInvite} disabled={busy} />
          <AppButton
            testID="new-game-insufficient-return-local"
            label={labels.returnLocal}
            onPress={onReturnLocal}
            disabled={busy}
            variant="secondary"
            style={styles.secondary}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels.cancel}
            onPress={onCancel}
            disabled={busy}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <AppText style={styles.cancelText}>{labels.cancel}</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: GRID.x2,
    backgroundColor: 'rgba(31, 41, 38, 0.48)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: GRID.x2,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: theme.colors.primaryLight,
  },
  icon: {
    color: theme.colors.primary,
    fontSize: 24,
  },
  title: {
    marginTop: GRID.x1_5,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    marginTop: GRID.x1,
    marginBottom: GRID.x2,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
  secondary: {
    marginTop: GRID.x1_5,
  },
  cancel: {
    minHeight: 44,
    marginTop: GRID.x1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.65,
  },
});

export default InsufficientPlayersModal;
