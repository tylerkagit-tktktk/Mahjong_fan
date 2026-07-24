import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppTextInput from '../../components/AppTextInput';
import AppText from '../../components/AppText';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import AppButton from '../../components/AppButton';
import Card from '../../components/Card';
import ScreenContainer from '../../components/ScreenContainer';
import { RootStackParamList } from '../../navigation/types';
import { typography } from '../../styles/typography';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { getCurrentSession, ensureSession, signOut } from '../../services/cloud/authRepo';
import { getProfile, getProfileStats, updateProfile } from '../../services/cloud/profileRepo';
import theme from '../../theme/theme';

function ProfileScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Profile'>) {
  const { t } = useAppLanguage();
  const [uid, setUid] = useState('');
  const [provider, setProvider] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [statsLine, setStatsLine] = useState('');

  const load = useCallback(async () => {
    const session = await ensureSession('google');
    setUid(session.uid);
    setProvider(session.provider);
    const profile = await getProfile(session.uid);
    const stats = await getProfileStats(session.uid);
    if (profile) {
      setDisplayName(profile.displayName);
      setAvatarUrl(profile.avatarUrl ?? '');
    }
    setStatsLine(
      t('profile.stats.summary', {
        hands: stats.handsParticipated,
        wins: stats.wins,
        zimo: stats.zimoCount,
        discard: stats.discardCount,
        draw: stats.drawCount,
      }),
    );
  }, [t]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const handleSave = useCallback(() => {
    updateProfile(uid, { displayName, avatarUrl: avatarUrl.trim() || null })
      .then(() => {
        Alert.alert(t('profile.alert.savedTitle'), t('profile.alert.savedMessage'));
        return load();
      })
      .catch((error) => Alert.alert(t('profile.alert.saveFailedTitle'), String(error)));
  }, [avatarUrl, displayName, load, t, uid]);

  const handleSignOut = useCallback(() => {
    signOut().then(async () => {
      const session = await getCurrentSession();
      if (!session) {
        Alert.alert(t('profile.alert.signedOutTitle'), t('profile.alert.signedOutMessage'));
      }
    });
  }, [t]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerBlock}>
          <AppText style={styles.title}>{t('profile.title')}</AppText>
          <AppText style={styles.subtitle}>{t('profile.subtitle')}</AppText>
        </View>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{t('profile.account.title')}</AppText>
          <InfoRow label={t('profile.account.uid')} value={uid || '-'} />
          <InfoRow label={t('profile.account.provider')} value={provider || '-'} />
        </Card>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{t('profile.form.title')}</AppText>
          <AppText style={styles.label}>{t('profile.form.displayName')}</AppText>
          <AppTextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('profile.form.displayNamePlaceholder')}
            placeholderTextColor={theme.colors.textSecondary}
          />

          <AppText style={styles.label}>{t('profile.form.avatarUrl')}</AppText>
          <AppTextInput
            style={styles.input}
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder={t('profile.form.avatarUrlPlaceholder')}
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
          />
        </Card>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{t('profile.stats.title')}</AppText>
          <AppText style={styles.stats}>{statsLine || t('profile.stats.loading')}</AppText>
        </Card>

        <View style={styles.actionStack}>
          <AppButton label={t('profile.actions.save')} onPress={handleSave} />
          <AppButton label={t('profile.actions.signOut')} onPress={handleSignOut} variant="secondary" />
          <AppButton label={t('profile.actions.backHome')} onPress={() => navigation.navigate('Home')} variant="secondary" />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <AppText style={styles.infoLabel}>{label}</AppText>
      <AppText style={styles.infoValue}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  headerBlock: {
    gap: 4,
    paddingTop: theme.spacing.sm,
  },
  title: {
    ...typography.title,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: theme.colors.textSecondary,
  },
  card: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  infoLabel: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  infoValue: {
    ...typography.body,
    color: theme.colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  label: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.textPrimary,
  },
  stats: {
    ...typography.body,
    color: theme.colors.textPrimary,
  },
  actionStack: {
    gap: theme.spacing.sm,
  },
});

export default ProfileScreen;
