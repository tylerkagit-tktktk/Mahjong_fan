import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, Text } from 'react-native';
import AddHandScreen from '../screens/AddHandScreen';
import AboutScreen from '../screens/AboutScreen';
import GameDashboardScreen from '../screens/GameDashboardScreen';
import GameTableScreen from '../screens/GameTableScreen';
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import theme from '../theme/theme';
import NewGameStepperScreen from '../screens/NewGameStepperScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SummaryScreen from '../screens/SummaryScreen';
import ProfileScreen from '../screens/cloud/ProfileScreen';
import RoomLobbyScreen from '../screens/cloud/RoomLobbyScreen';
import MultiplayerGameTableScreen from '../screens/cloud/MultiplayerGameTableScreen';
import CloudArchiveDetailScreen from '../screens/cloud/CloudArchiveDetailScreen';
import JoinInviteScreen from '../screens/cloud/JoinInviteScreen';
import { RootStackParamList } from './types';
import { useAppLanguage } from '../i18n/useAppLanguage';

const Stack = createNativeStackNavigator<RootStackParamList>();

const settingsHeaderTextStyle = {
  color: theme.colors.textSecondary,
  fontSize: 18,
  fontWeight: '500',
} as const;

function renderSettingsHeaderRight(onPress: () => void) {
  return function SettingsHeaderRight() {
    return (
      <Pressable onPress={onPress} hitSlop={10}>
        <Text style={settingsHeaderTextStyle}>⚙︎</Text>
      </Pressable>
    );
  };
}

function RootNavigator() {
  const { t } = useAppLanguage();
  return (
    <Stack.Navigator
      initialRouteName="Home"
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
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={({ navigation }) => ({
          title: t('home.historyAll'),
          headerRight: renderSettingsHeaderRight(() => navigation.navigate('Settings')),
        })}
      />
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
      <Stack.Screen
        name="GameTable"
        component={GameTableScreen}
        options={{ title: t('nav.dashboard') }}
      />
      <Stack.Screen name="AddHand" component={AddHandScreen} options={{ title: t('nav.addHand') }} />
      <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: t('nav.summary') }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ title: t('about.title') }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: t('nav.profile') }} />
      <Stack.Screen name="JoinInvite" component={JoinInviteScreen} options={{ title: t('nav.joinInvite') }} />
      <Stack.Screen name="RoomLobby" component={RoomLobbyScreen} options={{ title: t('nav.onlineGame') }} />
      <Stack.Screen
        name="MultiplayerGameTable"
        component={MultiplayerGameTableScreen}
        options={{ title: t('nav.dashboard') }}
      />
      <Stack.Screen
        name="CloudArchiveDetail"
        component={CloudArchiveDetailScreen}
        options={{ title: t('nav.dashboard') }}
      />
    </Stack.Navigator>
  );
}

export default RootNavigator;
