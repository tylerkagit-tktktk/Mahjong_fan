import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'AddHand'>;

function AddHandScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Hand</Text>
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
});

export default AddHandScreen;
