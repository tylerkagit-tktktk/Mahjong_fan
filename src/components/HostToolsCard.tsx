import { ReactNode } from 'react';
import AppText from './AppText';
import { Pressable, StyleSheet, View } from 'react-native';
import theme from '../theme/theme';
import { typography } from '../styles/typography';

type Props = {
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function HostToolsCard({ title, subtitle, expanded, onToggle, children }: Props) {
  return (
    <View style={styles.card}>
      <Pressable style={({ pressed }) => [styles.headerButton, pressed && styles.headerPressed]} onPress={onToggle}>
        <View style={styles.headerTextBlock}>
          <AppText style={styles.title}>{title}</AppText>
          {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
        </View>
        <AppText style={styles.chevron}>{expanded ? '收起' : '展開'}</AppText>
      </Pressable>

      {expanded ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  headerPressed: {
    opacity: 0.85,
  },
  headerTextBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  chevron: {
    ...typography.caption,
    color: theme.colors.primaryDark,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});

export default HostToolsCard;
