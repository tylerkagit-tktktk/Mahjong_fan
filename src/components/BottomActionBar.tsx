import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../theme/theme';
import AppButton from './AppButton';

type BottomActionBarProps = {
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryTestID?: string;
  primaryAccessibilityLabel?: string;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  disabled?: boolean;
  topContent?: ReactNode;
};

function BottomActionBar({
  primaryLabel,
  onPrimaryPress,
  primaryTestID,
  primaryAccessibilityLabel,
  secondaryLabel,
  onSecondaryPress,
  disabled = false,
  topContent,
}: BottomActionBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {topContent ? <View style={styles.topContent}>{topContent}</View> : null}
      <AppButton
        label={primaryLabel}
        onPress={onPrimaryPress}
        disabled={disabled}
        testID={primaryTestID}
        accessibilityLabel={primaryAccessibilityLabel}
      />
      {secondaryLabel && onSecondaryPress ? (
        <AppButton
          label={secondaryLabel}
          onPress={onSecondaryPress}
          disabled={disabled}
          variant="secondary"
          style={styles.secondaryAction}
        />
      ) : null}
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
  topContent: {
    marginBottom: 12,
  },
  secondaryAction: {
    marginTop: 12,
  },
});

export default BottomActionBar;
