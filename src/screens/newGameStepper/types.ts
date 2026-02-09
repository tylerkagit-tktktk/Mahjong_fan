import { RulesV1 } from '../../models/rules';

export type SeatMode = 'manual' | 'auto';
export type CapMode = 'none' | 'fanCap';

export type InvalidTarget =
  | { kind: 'title' }
  | { kind: 'manualPlayer'; index: number }
  | { kind: 'autoPlayer'; index: number }
  | { kind: 'players' }
  | { kind: 'minFan' }
  | { kind: 'unitPerFan' }
  | { kind: 'capFan' }
  | { kind: 'scoring' };

export type PreparedCreateContext = {
  gameId: string;
  trimmedTitle: string;
  resolvedPlayers: string[];
  playerInputs: Array<{
    id: string;
    gameId: string;
    name: string;
    seatIndex: number;
  }>;
  rules: RulesV1;
};

export type ConfirmField = {
  label: string;
  value: string;
};

export type ConfirmSections = {
  game: ConfirmField[];
  scoring: ConfirmField[];
  players: ConfirmField[];
};
