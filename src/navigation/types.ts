import { CurrencyCode } from '../models/currency';

export type RootStackParamList = {
  Home: undefined;
  History: undefined;
  NewGameStepper:
    | {
        entryMode?: 'local' | 'multiplayer';
        prefill?: {
          title: string;
          currencyCode?: CurrencyCode;
          serializedRules?: string;
        };
      }
    | undefined;
  GameTable: { gameId: string };
  GameDashboard: { gameId: string };
  Settings: undefined;
  About: undefined;
  Profile: { roomId?: string } | undefined;
  JoinLanding: undefined;
  JoinInvite: { roomId?: string; token?: string };
  RoomLobby: { roomId: string };
  MultiplayerGameTable: { roomId: string; displayName?: string };
  CloudArchiveDetail: { roomId: string };
};
