import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import Card from '../components/Card';
import ScreenContainer from '../components/ScreenContainer';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { RootStackParamList } from '../navigation/types';
import { typography } from '../styles/typography';
import theme from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'About'>;

const appPackage = require('../../package.json') as { version?: string };
const PRIVACY_URL = 'https://tylerkagit-tktktk.github.io/Mahjong_fan/privacy/';
const SUPPORT_EMAIL = 'mahjongfan.app@outlook.com';

function AboutScreen(_: Props) {
  const { t } = useAppLanguage();
  const version = appPackage.version ?? '—';
  const handlePrivacyPress = () => {
    Linking.openURL(PRIVACY_URL).catch(() => null);
  };
  const handleEmailPress = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => null);
  };

  return (
    <ScreenContainer style={styles.container} includeTopInset={false}>
      <Text style={styles.title}>{t('about.appTitle')}</Text>
      <Text style={styles.subtitle}>{t('about.subtitle')}</Text>

      <Card style={[styles.card, styles.firstCard]}>
        <Text style={styles.sectionTitle}>{t('about.section.usage.title')}</Text>
        <Text style={styles.sectionBody}>{t('about.section.usage.body')}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('about.section.privacy.title')}</Text>
        <Text style={styles.sectionBody}>{t('about.section.privacy.body')}</Text>
        <Pressable style={styles.privacyButton} onPress={handlePrivacyPress}>
          <Text style={styles.privacyButtonLabel}>{t('about.section.privacy.linkLabel')}</Text>
        </Pressable>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('about.section.meta.title')}</Text>
        <Text style={styles.sectionBody}>
          {t('about.section.meta.version')}: {version}
        </Text>
        <Text style={[styles.sectionBody, styles.metaHint]}>{t('about.section.meta.support')}</Text>
        <Pressable onPress={handleEmailPress}>
          <Text style={styles.emailLink}>{SUPPORT_EMAIL}</Text>
        </Pressable>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
  },
  title: {
    ...typography.title,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  card: {
    marginTop: theme.spacing.md,
    padding: 20,
    borderRadius: 18,
    backgroundColor: '#FCF9F4',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  firstCard: {
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  sectionBody: {
    ...typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  metaHint: {
    marginTop: theme.spacing.xs,
  },
  emailLink: {
    ...typography.body,
    color: theme.colors.primary,
    lineHeight: 22,
    marginTop: theme.spacing.xs,
    textDecorationLine: 'underline',
  },
  privacyButton: {
    marginTop: theme.spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 999,
    backgroundColor: '#F1ECE4',
  },
  privacyButtonLabel: {
    ...typography.button,
    color: theme.colors.primary,
  },
});

export default AboutScreen;
