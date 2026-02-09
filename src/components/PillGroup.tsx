import { StyleProp, StyleSheet, Text, View, ViewStyle, Pressable } from 'react-native';
import theme from '../theme/theme';

type PillOption = {
  key: string;
  label: string;
};

type PillGroupProps = {
  options: PillOption[];
  valueKey: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  includeNoneOption?: boolean;
  noneLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 } as const;

function PillGroup({
  options,
  valueKey,
  onChange,
  disabled = false,
  includeNoneOption = true,
  noneLabel = 'None',
  style,
}: PillGroupProps) {
  return (
    <View style={[styles.wrap, style]}>
      {includeNoneOption ? (
        <Pill
          label={noneLabel}
          selected={valueKey === null}
          onPress={() => onChange(null)}
          disabled={disabled}
        />
      ) : null}
      {options.map((option) => (
        <Pill
          key={option.key}
          label={option.label}
          selected={valueKey === option.key}
          onPress={() => onChange(option.key)}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

type PillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
};

function Pill({ label, selected, onPress, disabled }: PillProps) {
  return (
    <Pressable
      style={[styles.pill, selected ? styles.pillActive : null]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      hitSlop={HIT_SLOP}
    >
      <Text style={[styles.pillText, selected ? styles.pillTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: -8,
  },
  pill: {
    minWidth: 64,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  pillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E6F5F5',
  },
  pillText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
  },
  pillTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
});

export default PillGroup;
