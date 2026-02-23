export type RootStackParamList = {
  Home: undefined;
  History: undefined;
  Tabs: undefined;
  NewGameStepper: undefined;
  GameTable: { gameId: string };
  GameDashboard: { gameId: string };
  AddHand: { gameId: string };
  Summary: { gameId: string };
  Settings: undefined;
  About: undefined;
};
