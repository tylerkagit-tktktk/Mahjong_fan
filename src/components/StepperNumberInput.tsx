import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import theme from '../theme/theme';

type StepperNumberInputProps = {
  valueText: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  placeholder?: string;
  editable?: boolean;
  hasError?: boolean;
};

const HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 } as const;

function StepperNumberInput({
  valueText,
  onChangeText,
  onBlur,
  onIncrement,
  onDecrement,
  placeholder,
  editable = true,
  hasError = false,
}: StepperNumberInputProps) {
  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.adjustButton, styles.adjustButtonLeft]}
        onPress={onDecrement}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityState={{ disabled: !editable }}
        hitSlop={HIT_SLOP}
      >
        <Text style={styles.adjustText}>-</Text>
      </Pressable>
      <TextInput
        style={[styles.input, hasError ? styles.inputError : null]}
        keyboardType="number-pad"
        value={valueText}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        editable={editable}
      />
      <Pressable
        style={[styles.adjustButton, styles.adjustButtonRight]}
        onPress={onIncrement}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityState={{ disabled: !editable }}
        hitSlop={HIT_SLOP}
      >
        <Text style={styles.adjustText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adjustButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  adjustButtonLeft: {
    marginRight: 8,
  },
  adjustButtonRight: {
    marginLeft: 8,
  },
  adjustText: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: theme.fontSize.md,
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
  },
  inputError: {
    borderColor: theme.colors.danger,
  },
});

export default StepperNumberInput;
