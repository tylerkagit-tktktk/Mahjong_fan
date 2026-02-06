import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import Card from '../components/Card';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { useAppLanguage } from '../i18n/useAppLanguage';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

function SettingsScreen({ navigation }: Props) {
  const { t, setLanguage } = useAppLanguage();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
          <AppButton
            label={t('language.zhHant')}
            onPress={() => {
              setLanguage('zh-Hant').catch((error) => {
                console.error('[i18n] setLanguage zh-Hant failed', error);
              });
            }}
            style={styles.buttonSpacing}
          />
          <AppButton
            label={t('language.zhHans')}
            onPress={() => {
              setLanguage('zh-Hans').catch((error) => {
                console.error('[i18n] setLanguage zh-Hans failed', error);
              });
            }}
            style={styles.buttonSpacing}
          />
          <AppButton
            label={t('language.en')}
            onPress={() => {
              setLanguage('en').catch((error) => {
                console.error('[i18n] setLanguage en failed', error);
              });
            }}
            style={styles.buttonSpacing}
          />
        </Card>

        <AppButton
          label={t('common.back')}
          onPress={() => navigation.goBack()}
          variant="secondary"
          style={styles.backButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  card: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  buttonSpacing: {
    marginTop: theme.spacing.sm,
  },
  backButton: {
    marginTop: theme.spacing.sm,
  },
});

export default SettingsScreen;
