import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AddHandScreen from '../screens/AddHandScreen';
import GameDashboardScreen from '../screens/GameDashboardScreen';
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import theme from '../theme/theme';
import NewGameStepperScreen from '../screens/NewGameStepperScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SummaryScreen from '../screens/SummaryScreen';
import { RootStackParamList, RootTabParamList } from './types';
import { useAppLanguage } from '../i18n/useAppLanguage';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

function AppTabs() {
  const { t } = useAppLanguage();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        sceneContainerStyle: {
          backgroundColor: theme.colors.background,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t('nav.home') }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: t('nav.history') }} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { t } = useAppLanguage();
  return (
    <Stack.Navigator
      initialRouteName="Tabs"
      screenOptions={{
        headerTitleAlign: 'center',
        headerBackVisible: true,
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerShadowVisible: false,
        headerTintColor: theme.colors.textPrimary,
      }}
    >
      <Stack.Screen name="Tabs" component={AppTabs} options={{ headerShown: false }} />
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
