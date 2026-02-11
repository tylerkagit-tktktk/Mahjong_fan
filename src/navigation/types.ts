export type RootTabParamList = {
  Home: undefined;
  History: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  NewGameStepper: undefined;
  GameTable: { gameId: string };
  GameDashboard: { gameId: string };
  AddHand: { gameId: string };
  Summary: { gameId: string };
  Settings: undefined;
};
