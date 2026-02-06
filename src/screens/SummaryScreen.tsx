import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { useAppLanguage } from '../i18n/useAppLanguage';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

function SummaryScreen({ navigation }: Props) {
  const { t } = useAppLanguage();
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Text style={styles.title}>{t('summary.title')}</Text>
      <AppButton label={t('common.back')} onPress={() => navigation.goBack()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
});

export default SummaryScreen;
