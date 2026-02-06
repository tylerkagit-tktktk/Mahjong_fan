import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import theme from '../theme/theme';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

function AppButton({
  label,
  onPress,
  style,
  disabled,
  variant = 'primary',
}: AppButtonProps) {
  const isSecondary = variant === 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        isSecondary && styles.secondaryButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
        disabled && isSecondary && styles.secondaryDisabled,
        style,
      ]}
    >
      <Text style={[styles.text, isSecondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    backgroundColor: theme.colors.border,
    borderColor: theme.colors.border,
  },
  secondaryDisabled: {
    backgroundColor: theme.colors.surface,
  },
  text: {
    color: theme.colors.surface,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  secondaryText: {
    color: theme.colors.primary,
  },
});

export default AppButton;
