import { Pressable, StyleSheet } from 'react-native';
import AppText from './AppText';
import theme from '../theme/theme';

type Props = {
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  fontSize?: number;
  disabled?: boolean;
  testID?: string;
};

function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  fontSize = 27,
  disabled,
  testID,
}: Props) {
  const isDisabled = disabled === true;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled === undefined ? undefined : { disabled: isDisabled }}
      hitSlop={10}
      style={({ pressed }) => [styles.container, isDisabled && styles.disabled, pressed && styles.pressed]}
    >
      <AppText style={[styles.icon, { fontSize, lineHeight: fontSize + 4 }]}>{icon}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.45,
  },
  disabled: {
    opacity: 0.35,
  },
  icon: {
    color: theme.colors.textPrimary,
    fontWeight: '400',
  },
});

export default HeaderIconButton;
