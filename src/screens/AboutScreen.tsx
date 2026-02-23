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
  const openPrivacyPolicy = () => {
    Linking.openURL(PRIVACY_URL).catch(() => null);
  };
  const openSupportEmail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => null);
  };

  return (
    <ScreenContainer style={styles.container} includeTopInset={false}>
      <Text style={styles.title}>麻雀番埋嚟</Text>
      <Text style={styles.subtitle}>{t('about.subtitle')}</Text>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('about.section.usage.title')}</Text>
        <Text style={styles.sectionBody}>{t('about.section.usage.body')}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('about.section.privacy.title')}</Text>
        <Text style={styles.sectionBody}>{t('about.section.privacy.body')}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('about.section.meta.title')}</Text>
        <Text style={styles.sectionBody}>
          {t('about.section.meta.version')}: {version}
        </Text>
        <Text style={styles.sectionBody}>{t('about.section.meta.support')}</Text>
        <Pressable onPress={openSupportEmail}>
          <Text style={styles.linkText}>{SUPPORT_EMAIL}</Text>
        </Pressable>
        <Pressable onPress={openPrivacyPolicy}>
          <Text style={styles.linkText}>{PRIVACY_URL}</Text>
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
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  card: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
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
  linkText: {
    ...typography.body,
    color: theme.colors.brandPrimary,
    lineHeight: 22,
    marginTop: theme.spacing.xs,
  },
});

export default AboutScreen;
