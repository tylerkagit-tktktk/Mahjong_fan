import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AddHandScreen from '../screens/AddHandScreen';
import GameDashboardScreen from '../screens/GameDashboardScreen';
import HomeScreen from '../screens/HomeScreen';
import NewGameStepperScreen from '../screens/NewGameStepperScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SummaryScreen from '../screens/SummaryScreen';

export type RootStackParamList = {
  Home: undefined;
  NewGameStepper: undefined;
  GameDashboard: { gameId: string };
  AddHand: undefined;
  Summary: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerTitleAlign: 'center',
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Mahjong' }} />
      <Stack.Screen
        name="NewGameStepper"
        component={NewGameStepperScreen}
        options={{ title: 'New Game' }}
      />
      <Stack.Screen
        name="GameDashboard"
        component={GameDashboardScreen}
        options={{ title: 'Game Dashboard' }}
      />
      <Stack.Screen name="AddHand" component={AddHandScreen} options={{ title: 'Add Hand' }} />
      <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: 'Summary' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Stack.Navigator>
  );
}

export default RootNavigator;
