import { Pressable, StyleSheet } from 'react-native';
import AppText from './AppText';
import theme from '../theme/theme';

type Props = {
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  fontSize?: number;
};

function HeaderIconButton({ icon, onPress, accessibilityLabel, fontSize = 27 }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
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
  icon: {
    color: theme.colors.textPrimary,
    fontWeight: '400',
  },
});

export default HeaderIconButton;
