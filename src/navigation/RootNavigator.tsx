import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AddHandScreen from '../screens/AddHandScreen';
import GameDashboardScreen from '../screens/GameDashboardScreen';
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import NewGameStepperScreen from '../screens/NewGameStepperScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SummaryScreen from '../screens/SummaryScreen';
import { RootStackParamList } from './types';
import { useAppLanguage } from '../i18n/useAppLanguage';

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { t } = useAppLanguage();
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerTitleAlign: 'center',
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: t('nav.home') }} />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: t('nav.history') }} />
      <Stack.Screen
        name="NewGameStepper"
        component={NewGameStepperScreen}
        options={{ title: t('nav.newGame') }}
      />
      <Stack.Screen
        name="GameDashboard"
        component={GameDashboardScreen}
        options={{ title: t('nav.dashboard') }}
      />
      <Stack.Screen name="AddHand" component={AddHandScreen} options={{ title: t('nav.addHand') }} />
      <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: t('nav.summary') }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
    </Stack.Navigator>
  );
}

export default RootNavigator;
