import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import AppButton from '../../components/AppButton';
import AppText from '../../components/AppText';
import AppTextInput from '../../components/AppTextInput';
import Card from '../../components/Card';
import ScreenContainer from '../../components/ScreenContainer';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { parseInviteLink } from '../../navigation/inviteLink';
import { RootStackParamList } from '../../navigation/types';
import { typography } from '../../styles/typography';
import theme from '../../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinLanding'>;
type InputError = 'required' | 'format' | null;

function JoinLandingScreen({ navigation }: Props) {
  const { t } = useAppLanguage();
  const [inviteLink, setInviteLink] = useState('');
  const [inputError, setInputError] = useState<InputError>(null);

  const errorMessage = inputError === 'required'
    ? t('joinLanding.required')
    : inputError === 'format'
      ? t('joinLanding.formatError')
      : null;

  const handleChange = (value: string) => {
    setInviteLink(value);
    if (inputError) setInputError(null);
  };

  const handleSubmit = () => {
    if (!inviteLink.trim()) {
      setInputError('required');
      return;
    }

    const parsed = parseInviteLink(inviteLink);
    if (!parsed.ok) {
      setInputError('format');
      return;
    }

    navigation.navigate('JoinInvite', parsed.invite);
  };

  return (
    <ScreenContainer style={styles.screen} includeTopInset={false} horizontalPadding={0}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.card}>
            <View style={styles.intro}>
              <AppText accessibilityRole="header" style={styles.title}>{t('joinLanding.title')}</AppText>
              <AppText style={styles.body}>{t('joinLanding.body')}</AppText>
            </View>

            <View style={styles.inputGroup}>
              <AppText style={styles.label}>{t('joinLanding.inputLabel')}</AppText>
              <AppTextInput
                testID="join-landing-invite-link"
                accessibilityLabel={t('joinLanding.inputLabel')}
                accessibilityHint={t('joinLanding.inputHint')}
                value={inviteLink}
                onChangeText={handleChange}
                placeholder={t('joinLanding.placeholder')}
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={2048}
                style={[styles.input, inputError && styles.inputError]}
              />
              {errorMessage ? (
                <AppText
                  testID="join-landing-error"
                  accessibilityLiveRegion="polite"
                  style={styles.error}
                >
                  {errorMessage}
                </AppText>
              ) : (
                <AppText style={styles.hint}>{t('joinLanding.inputHint')}</AppText>
              )}
            </View>

            <AppButton
              testID="join-landing-submit"
              label={t('joinLanding.action')}
              accessibilityLabel={t('joinLanding.action')}
              onPress={handleSubmit}
            />
          </Card>

          <AppText style={styles.footer}>{t('joinLanding.footer')}</AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    gap: theme.spacing.lg,
  },
  intro: {
    gap: theme.spacing.sm,
  },
  title: {
    ...typography.title,
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  body: {
    ...typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
  inputGroup: {
    gap: theme.spacing.xs,
  },
  label: {
    ...typography.caption,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    lineHeight: 22,
  },
  inputError: {
    borderColor: theme.colors.danger,
  },
  hint: {
    ...typography.caption,
    color: theme.colors.textSecondary,
    lineHeight: 19,
  },
  error: {
    ...typography.caption,
    color: theme.colors.danger,
    lineHeight: 19,
  },
  footer: {
    ...typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
  },
});

export default JoinLandingScreen;
