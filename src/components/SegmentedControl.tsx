import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import AppText from './AppText';
import theme from '../theme/theme';

type SegmentedOption<T extends string | number> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string | number> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  style?: ViewStyle;
};

const HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 } as const;

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false,
  style,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.row, style]}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const isLast = index === options.length - 1;
        return (
          <Pressable
            key={String(option.value)}
            style={[
              styles.button,
              !isLast ? styles.buttonSpacing : null,
              selected ? styles.buttonActive : null,
            ]}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            hitSlop={HIT_SLOP}
          >
            <AppText style={[styles.text, selected ? styles.textActive : null]}>{option.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  buttonSpacing: {
    marginRight: 8,
  },
  buttonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E6F5F5',
  },
  text: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  textActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
});

export default SegmentedControl;
