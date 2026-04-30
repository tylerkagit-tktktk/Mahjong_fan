import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AppButton from '../../components/AppButton';
import Card from '../../components/Card';
import ScreenContainer from '../../components/ScreenContainer';
import { RootStackParamList } from '../../navigation/types';
import { typography } from '../../styles/typography';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { getCurrentSession, ensureSession, signInWithProvider, signOut } from '../../services/cloud/authRepo';
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
          <Text style={styles.title}>{t('profile.title')}</Text>
          <Text style={styles.subtitle}>{t('profile.subtitle')}</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('profile.account.title')}</Text>
          <InfoRow label={t('profile.account.uid')} value={uid || '-'} />
          <InfoRow label={t('profile.account.provider')} value={provider || '-'} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('profile.form.title')}</Text>
          <Text style={styles.label}>{t('profile.form.displayName')}</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('profile.form.displayNamePlaceholder')}
            placeholderTextColor={theme.colors.textSecondary}
          />

          <Text style={styles.label}>{t('profile.form.avatarUrl')}</Text>
          <TextInput
            style={styles.input}
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder={t('profile.form.avatarUrlPlaceholder')}
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('profile.stats.title')}</Text>
          <Text style={styles.stats}>{statsLine || t('profile.stats.loading')}</Text>
        </Card>

        <View style={styles.actionStack}>
          <AppButton label={t('profile.actions.save')} onPress={handleSave} />
          <AppButton
            label={t('profile.actions.signInApple')}
            onPress={() => {
              signInWithProvider('apple').then(load).catch(() => {});
            }}
            variant="secondary"
          />
          <AppButton
            label={t('profile.actions.signInGoogle')}
            onPress={() => {
              signInWithProvider('google').then(load).catch(() => {});
            }}
            variant="secondary"
          />
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
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
