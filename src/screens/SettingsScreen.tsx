import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppText from '../components/AppText';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AppButton from '../components/AppButton';
import Card from '../components/Card';
import ScreenContainer from '../components/ScreenContainer';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { LanguageCode } from '../i18n/types';
import { CurrencyCode } from '../models/currency';
import { AppTextSize } from '../settings/appPreferences';
import { useAppPreferences } from '../settings/useAppPreferences';
import { typography } from '../styles/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

function SettingsScreen({ navigation }: Props) {
  const { language, t, setLanguage } = useAppLanguage();
  const { defaultCurrencyCode, setDefaultCurrencyCode, setTextSize, textSize } = useAppPreferences();

  const languageOptions: Array<{ code: LanguageCode; label: string }> = [
    { code: 'zh-Hant', label: '繁體' },
    { code: 'zh-Hans', label: '简体' },
    { code: 'en', label: 'English' },
  ];

  const handleLanguageChange = (nextLanguage: LanguageCode) => {
    if (nextLanguage === language) {
      return;
    }
    setLanguage(nextLanguage).catch((error) => {
      console.error(`[i18n] setLanguage ${nextLanguage} failed`, error);
    });
  };

  const currencyOptions: Array<{ code: CurrencyCode; label: string }> = [
    { code: 'HKD', label: 'HKD' },
    { code: 'TWD', label: 'TWD' },
    { code: 'CNY', label: 'CNY' },
  ];
  const textSizeOptions: Array<{ value: AppTextSize; label: string }> = [
    { value: 'small', label: t('settings.textSize.small') },
    { value: 'normal', label: t('settings.textSize.normal') },
    { value: 'large', label: t('settings.textSize.large') },
  ];

  return (
    <ScreenContainer style={styles.container} horizontalPadding={0} includeTopInset={false}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{t('settings.language')}</AppText>
          <View style={styles.languageList}>
            {languageOptions.map((option) => {
              const selected = language === option.code;
              return (
                <Pressable
                  key={option.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => handleLanguageChange(option.code)}
                  style={({ pressed }) => [
                    styles.languageRow,
                    selected && styles.languageRowSelected,
                    pressed && styles.languageRowPressed,
                  ]}
                >
                  <AppText style={[styles.languageName, selected && styles.languageNameSelected]} numberOfLines={1}>
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{t('settings.defaultCurrency')}</AppText>
          <AppText style={styles.sectionHint}>{t('settings.defaultCurrencyHint')}</AppText>
          <View style={styles.currencyList}>
            {currencyOptions.map((option) => {
              const selected = defaultCurrencyCode === option.code;
              return (
                <Pressable
                  key={option.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setDefaultCurrencyCode(option.code).catch((error) => {
                      console.error('[settings] set default currency failed', error);
                    });
                  }}
                  style={({ pressed }) => [
                    styles.currencyOption,
                    selected && styles.currencyOptionSelected,
                    pressed && styles.currencyOptionPressed,
                  ]}
                >
                  <AppText style={[styles.currencyOptionText, selected && styles.currencyOptionTextSelected]}>{option.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card style={styles.card}>
          <AppText style={styles.sectionTitle}>{t('settings.textSize')}</AppText>
          <AppText style={styles.sectionHint}>{t('settings.textSizeHint')}</AppText>
          <View style={styles.textSizeList}>
            {textSizeOptions.map((option) => {
              const selected = textSize === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setTextSize(option.value).catch((error) => {
                      console.error('[settings] set text size failed', error);
                    });
                  }}
                  style={({ pressed }) => [
                    styles.textSizeOption,
                    selected && styles.textSizeOptionSelected,
                    pressed && styles.currencyOptionPressed,
                  ]}
                >
                  <AppText style={[styles.textSizeOptionText, selected && styles.currencyOptionTextSelected]}>{option.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <AppButton
          label={t('settings.about')}
          onPress={() => navigation.push('About')}
          variant="secondary"
          style={styles.aboutButton}
        />

      </ScrollView>
    </ScreenContainer>
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
  card: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    ...typography.subtitle,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  sectionHint: {
    ...typography.body,
    color: theme.colors.textSecondary,
    marginTop: -4,
    marginBottom: theme.spacing.sm,
  },
  languageList: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: theme.radius.md,
    backgroundColor: '#F1ECE4',
  },
  languageRow: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },
  languageRowSelected: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  languageRowPressed: {
    opacity: 0.72,
  },
  languageName: {
    ...typography.body,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  languageNameSelected: {
    color: theme.colors.primary,
  },
  currencyList: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  currencyOption: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  currencyOptionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E6F5F5',
  },
  currencyOptionPressed: {
    opacity: 0.72,
  },
  currencyOptionText: {
    ...typography.body,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  currencyOptionTextSelected: {
    color: theme.colors.primary,
  },
  textSizeList: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: theme.radius.md,
    backgroundColor: '#F1ECE4',
  },
  textSizeOption: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
  },
  textSizeOptionSelected: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  textSizeOptionText: {
    ...typography.body,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  aboutButton: {
    marginTop: theme.spacing.sm,
  },
});

export default SettingsScreen;
