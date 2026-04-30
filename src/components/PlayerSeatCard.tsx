import { Image, StyleSheet, Text, View } from 'react-native';
import theme from '../theme/theme';
import { typography } from '../styles/typography';

type Props = {
  seatLabel: string;
  displayName: string;
  avatarUrl?: string | null;
  isHost?: boolean;
  isSelf?: boolean;
  isTemporary?: boolean;
  temporaryLabel?: string;
  isOccupied?: boolean;
  statusLabel?: string;
  compact?: boolean;
};

function getInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return '?';
  }
  return trimmed.slice(0, 1).toUpperCase();
}

function PlayerSeatCard({
  seatLabel,
  displayName,
  avatarUrl,
  isHost = false,
  isSelf = false,
  isTemporary = false,
  temporaryLabel = '臨時',
  isOccupied = true,
  statusLabel,
  compact = false,
}: Props) {
  return (
    <View style={[styles.card, compact && styles.cardCompact, !isOccupied && styles.cardEmpty]}>
      <View style={styles.headerRow}>
        <Text style={styles.seatLabel}>{seatLabel}</Text>
        {statusLabel ? <Text style={[styles.statusTag, !isOccupied && styles.statusTagMuted]}>{statusLabel}</Text> : null}
      </View>

      <View style={styles.contentRow}>
        <View style={[styles.avatarWrap, compact && styles.avatarWrapCompact]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.avatarFallback, compact && styles.avatarFallbackCompact]}>{getInitials(displayName)}</Text>
          )}
        </View>

        <View style={styles.nameBlock}>
          <Text style={[styles.displayName, !isOccupied && styles.displayNameMuted]} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.badgesRow}>
            {isTemporary ? <Text style={styles.badgeMuted}>{temporaryLabel}</Text> : null}
            {isHost ? <Text style={styles.badge}>房主</Text> : null}
            {isSelf ? <Text style={styles.badgePrimary}>你</Text> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cardCompact: {
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  cardEmpty: {
    backgroundColor: '#FBF9F5',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  seatLabel: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
  },
  statusTag: {
    ...typography.caption,
    color: theme.colors.primaryDark,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  statusTagMuted: {
    color: theme.colors.textSecondary,
    backgroundColor: '#EEE8E0',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarWrapCompact: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    ...typography.subtitle,
    color: theme.colors.primaryDark,
    fontWeight: '700',
  },
  avatarFallbackCompact: {
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  displayName: {
    ...typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  displayNameMuted: {
    color: theme.colors.textSecondary,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  badgePrimary: {
    ...typography.caption,
    color: theme.colors.primaryDark,
    fontWeight: '700',
  },
  badgeMuted: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
});

export default PlayerSeatCard;
