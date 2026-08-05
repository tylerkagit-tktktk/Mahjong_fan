import QRCode from 'react-native-qrcode-svg';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import AppButton from './AppButton';
import AppText from './AppText';
import theme from '../theme/theme';
import type { InvitePayload } from '../services/cloud/roomRepo';

export type InviteShareLabels = {
  title: string;
  subtitle: string;
  qrCodeLabel: string;
  roomCodeLabel: string;
  inviteUrlLabel: string;
  shareAction: string;
  close: string;
  loading: string;
};

type InviteShareModalProps = {
  visible: boolean;
  roomTitle: string;
  invite: InvitePayload | null;
  busy: boolean;
  labels: InviteShareLabels;
  onClose: () => void;
  onShare: () => void;
};

export default function InviteShareModal({
  visible,
  roomTitle,
  invite,
  busy,
  labels,
  onClose,
  onShare,
}: InviteShareModalProps) {
  const { width } = useWindowDimensions();
  const qrSize = Math.min(220, Math.max(160, width - 120));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.close}
          disabled={busy}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <AppText
              style={styles.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {labels.title}
            </AppText>
            {roomTitle ? <AppText style={styles.subtitle}>{roomTitle}</AppText> : null}

            {invite ? (
              <>
                <View testID="invite-share-qr" style={styles.qrContainer}>
                  <QRCode
                    value={invite.deepLink}
                    size={qrSize}
                    backgroundColor={theme.colors.surface}
                    color={theme.colors.textPrimary}
                  />
                </View>

                <View style={styles.valueBlock}>
                  <AppText style={styles.label}>{labels.inviteUrlLabel}</AppText>
                  <AppText selectable style={styles.url}>
                    {invite.deepLink}
                  </AppText>
                </View>
              </>
            ) : (
              <AppText style={styles.loading}>{labels.loading}</AppText>
            )}

            <AppButton
              testID="invite-share-action"
              label={busy ? labels.loading : labels.shareAction}
              onPress={onShare}
              disabled={!invite || busy}
            />
            <AppButton
              testID="invite-share-close"
              label={labels.close}
              onPress={onClose}
              disabled={busy}
              variant="secondary"
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(31, 41, 38, 0.45)',
  },
  sheet: {
    width: '90%',
    maxHeight: '90%',
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  content: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  valueBlock: {
    gap: theme.spacing.xs,
  },
  url: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
  },
  loading: {
    color: theme.colors.textSecondary,
    paddingVertical: theme.spacing.xl,
    textAlign: 'center',
  },
});
