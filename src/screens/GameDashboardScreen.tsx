import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'GameDashboard'>;

function GameDashboardScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Game Dashboard</Text>
      <Text style={styles.subtitle}>Game ID: {gameId}</Text>
      <PrimaryButton label="Back" onPress={() => navigation.goBack()} />
    </View>
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
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
});

export default GameDashboardScreen;
