import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import Card from '../components/Card';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { deleteAllGames, restoreLastBackup, seedDemoGames } from '../db/repo';
import { isDev } from '../debug/isDev';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

function SettingsScreen({ navigation }: Props) {
  const { t, setLanguage } = useAppLanguage();

  const handleDeleteAllGames = () => {
    Alert.alert(t('settings.dev.delete.confirmTitle'), t('settings.dev.delete.confirmMessage'), [
      { text: t('settings.dev.common.cancel'), style: 'cancel' },
      {
        text: t('settings.dev.common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteAllGames().catch((error) => {
            console.error('[DB] deleteAllGames failed', error);
          });
        },
      },
    ]);
  };

  const handleSeedDemoGames = () => {
    Alert.alert(t('settings.dev.seed.confirmTitle'), t('settings.dev.seed.confirmMessage'), [
      { text: t('settings.dev.common.cancel'), style: 'cancel' },
      {
        text: t('settings.dev.seed.action'),
        onPress: () => {
          seedDemoGames()
            .then(() => {
              Alert.alert(t('settings.dev.seed.successTitle'), t('settings.dev.seed.successMessage'));
            })
            .catch((error) => {
              console.error('[DB] seedDemoGames failed', error);
              Alert.alert(t('settings.dev.seed.errorTitle'), t('settings.dev.seed.errorMessage'));
            });
        },
      },
    ]);
  };

  const handleRestoreBackup = () => {
    Alert.alert(
      t('settings.dev.restore.confirmTitle'),
      t('settings.dev.restore.confirmMessage'),
      [
        { text: t('settings.dev.common.cancel'), style: 'cancel' },
        {
          text: t('settings.dev.restore.action'),
          onPress: () => {
            restoreLastBackup()
              .then((result) => {
                if (result.restored) {
                  Alert.alert(t('settings.dev.restore.successTitle'), t('settings.dev.restore.successMessage'));
                  return;
                }
                if (result.reason === 'missing') {
                  Alert.alert(t('settings.dev.restore.emptyTitle'), t('settings.dev.restore.emptyMessage'));
                  return;
                }
                const validationMessageKey =
                  result.reason === 'schema'
                    ? 'settings.dev.restore.validation.schema'
                    : result.reason === 'handsCount'
                      ? 'settings.dev.restore.validation.handsCount'
                      : result.reason === 'deltas'
                        ? 'settings.dev.restore.validation.deltas'
                        : 'settings.dev.restore.validation.state';
                Alert.alert(
                  t('settings.dev.restore.validationTitle'),
                  t(validationMessageKey),
                );
              })
              .catch((error) => {
                console.error('[DB] restoreLastBackup failed', error);
                Alert.alert(t('settings.dev.restore.errorTitle'), t('settings.dev.restore.errorMessage'));
              });
          },
        },
      ],
    );
  };

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

        {isDev ? (
          <View style={styles.devSection}>
            <Pressable onPress={handleDeleteAllGames} style={styles.devDangerButton} hitSlop={10}>
              <Text style={styles.devDangerText}>{t('settings.dev.delete.button')}</Text>
            </Pressable>
            <Pressable onPress={handleSeedDemoGames} style={styles.devSeedButton} hitSlop={10}>
              <Text style={styles.devSeedText}>{t('settings.dev.seed.button')}</Text>
            </Pressable>
            <Pressable onPress={handleRestoreBackup} style={styles.devSeedButton} hitSlop={10}>
              <Text style={styles.devSeedText}>{t('settings.dev.restore.button')}</Text>
            </Pressable>
          </View>
        ) : null}
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
  devSection: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  devDangerButton: {
    minHeight: 44,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(178,58,52,0.45)',
    backgroundColor: 'rgba(178,58,52,0.08)',
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  devDangerText: {
    fontSize: theme.fontSize.sm,
    color: '#B23A34',
    fontWeight: '600',
  },
  devSeedButton: {
    minHeight: 44,
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(70,63,56,0.18)',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  devSeedText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
});

export default SettingsScreen;
