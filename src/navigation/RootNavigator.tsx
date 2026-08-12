import {
  createNativeStackNavigator,
  type NativeStackHeaderBackProps,
  type NativeStackHeaderItemProps,
} from '@react-navigation/native-stack';
import AboutScreen from '../screens/AboutScreen';
import GameDashboardScreen from '../screens/GameDashboardScreen';
import GameTableScreen from '../screens/GameTableScreen';
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import theme from '../theme/theme';
import NewGameStepperScreen from '../screens/NewGameStepperScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ProfileScreen from '../screens/cloud/ProfileScreen';
import RoomLobbyScreen from '../screens/cloud/RoomLobbyScreen';
import MultiplayerGameTableScreen from '../screens/cloud/MultiplayerGameTableScreen';
import CloudArchiveDetailScreen from '../screens/cloud/CloudArchiveDetailScreen';
import JoinInviteScreen from '../screens/cloud/JoinInviteScreen';
import JoinLandingScreen from '../screens/cloud/JoinLandingScreen';
import { RootStackParamList } from './types';
import { useAppLanguage } from '../i18n/useAppLanguage';
import HeaderIconButton from '../components/HeaderIconButton';
import { createCustomHeaderItem } from './headerItems';

const Stack = createNativeStackNavigator<RootStackParamList>();

type HeaderNavigation = {
  goBack: () => void;
};

function createHeaderBackButton(navigation: HeaderNavigation, accessibilityLabel: string) {
  return ({ canGoBack }: NativeStackHeaderBackProps) =>
    canGoBack ? (
      <HeaderIconButton
        icon="‹"
        onPress={() => navigation.goBack()}
        accessibilityLabel={accessibilityLabel}
      />
    ) : null;
}

function createHeaderBackItems(navigation: HeaderNavigation, accessibilityLabel: string) {
  return ({ canGoBack }: NativeStackHeaderItemProps) =>
    canGoBack
      ? [
          createCustomHeaderItem(
            <HeaderIconButton
              icon="‹"
              onPress={() => navigation.goBack()}
              accessibilityLabel={accessibilityLabel}
            />,
          ),
        ]
      : [];
}

function RootNavigator() {
  const { t } = useAppLanguage();
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={({ navigation }) => ({
        headerTitleAlign: 'center',
        headerBackVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerLeft: createHeaderBackButton(navigation, t('common.back')),
        unstable_headerLeftItems: createHeaderBackItems(navigation, t('common.back')),
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerShadowVisible: false,
        headerTintColor: theme.colors.textPrimary,
      })}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: t('home.historyAll') }}
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
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ title: t('about.title') }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: t('nav.profile') }} />
      <Stack.Screen name="JoinLanding" component={JoinLandingScreen} options={{ title: t('nav.joinLanding') }} />
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
