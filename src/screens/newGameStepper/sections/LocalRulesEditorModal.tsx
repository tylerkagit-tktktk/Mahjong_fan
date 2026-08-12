import { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AppButton from '../../../components/AppButton';
import AppText from '../../../components/AppText';
import theme from '../../../theme/theme';
import { GRID } from '../constants';

type Props = {
  inline?: boolean;
  visible: boolean;
  title: string;
  closeLabel: string;
  doneLabel: string;
  children: ReactNode;
  onClose: () => void;
};

function LocalRulesEditorModal({ inline = false, visible, title, closeLabel, doneLabel, children, onClose }: Props) {
  if (inline) {
    return <>{children}</>;
  }

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View testID="new-game-local-rules-editor" style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <AppText style={styles.title}>{title}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <AppText style={styles.closeText}>×</AppText>
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {children}
          </ScrollView>
          <View style={styles.footer}>
            <AppButton testID="new-game-local-rules-done" label={doneLabel} onPress={onClose} />
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
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginTop: GRID.x1,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  headerRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GRID.x2,
  },
  title: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -44,
  },
  closeText: {
    color: theme.colors.textSecondary,
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '300',
  },
  pressed: {
    opacity: 0.65,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: GRID.x2,
    paddingBottom: GRID.x1,
  },
  footer: {
    paddingHorizontal: GRID.x2,
    paddingTop: GRID.x1_5,
    paddingBottom: GRID.x2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
});

export default LocalRulesEditorModal;
