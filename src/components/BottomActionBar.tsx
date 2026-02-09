import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../theme/theme';
import AppButton from './AppButton';

type BottomActionBarProps = {
  primaryLabel: string;
  onPrimaryPress: () => void;
  secondaryLabel: string;
  onSecondaryPress: () => void;
  disabled?: boolean;
};

function BottomActionBar({
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
  disabled = false,
}: BottomActionBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <AppButton label={primaryLabel} onPress={onPrimaryPress} disabled={disabled} />
      <AppButton
        label={secondaryLabel}
        onPress={onSecondaryPress}
        disabled={disabled}
        variant="secondary"
        style={styles.secondaryAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  secondaryAction: {
    marginTop: 12,
  },
});

export default BottomActionBar;
