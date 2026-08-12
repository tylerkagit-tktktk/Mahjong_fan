import AppText from '../../../components/AppText';
import Card from '../../../components/Card';
import { Pressable, StyleSheet, View } from 'react-native';
import theme from '../../../theme/theme';
import { GRID } from '../constants';

type Props = {
  title: string;
  editLabel: string;
  editAccessibilityLabel: string;
  summaryLines: string[];
  onEdit: () => void;
  testID?: string;
  editTestID?: string;
};

function LocalRulesSummary({
  title,
  editLabel,
  editAccessibilityLabel,
  summaryLines,
  onEdit,
  testID = 'new-game-local-rules-summary',
  editTestID = 'new-game-local-edit-rules',
}: Props) {
  return (
    <View testID={testID}>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <AppText style={styles.title}>{title}</AppText>
          <Pressable
            testID={editTestID}
            accessibilityRole="button"
            accessibilityLabel={editAccessibilityLabel}
            hitSlop={8}
            onPress={onEdit}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          >
            <AppText style={styles.editText}>{editLabel}</AppText>
            <AppText accessibilityElementsHidden style={styles.chevron}>›</AppText>
          </Pressable>
        </View>
        {summaryLines.map((line) => (
          <AppText key={line} style={styles.summaryLine}>
            {line}
          </AppText>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: GRID.x2,
    padding: GRID.x2,
  },
  headerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: GRID.x2,
  },
  title: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  editButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: GRID.x1,
  },
  editText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  chevron: {
    marginLeft: 4,
    color: theme.colors.primary,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '300',
  },
  pressed: {
    opacity: 0.65,
  },
  summaryLine: {
    marginTop: GRID.x1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
  },
});

export default LocalRulesSummary;
