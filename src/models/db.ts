export type Rules = {
  version?: number;
  payload?: Record<string, unknown>;
};

export type Transfer = {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  reason?: string;
};

export type Game = {
  id: string;
  title: string;
  createdAt: number;
  currencySymbol: string;
  variant: string;
  rulesJson: string;
  startingDealerSeatIndex: number;
  languageOverride?: string | null;
};

export type Player = {
  id: string;
  gameId: string;
  name: string;
  seatIndex: number;
};

export type Hand = {
  id: string;
  gameId: string;
  handIndex: number;
  dealerSeatIndex: number;
  isDraw: boolean;
  winnerSeatIndex?: number | null;
  type: string;
  winnerPlayerId?: string | null;
  discarderPlayerId?: string | null;
  inputValue?: number | null;
  deltasJson?: string | null;
  computedJson: string;
  createdAt: number;
};

export type GameBundle = {
  game: Game;
  players: Player[];
  hands: Hand[];
};

export type NewGameInput = Omit<Game, 'createdAt'> & { createdAt?: number };
export type NewPlayerInput = Player;
export type NewHandInput = Omit<Hand, 'handIndex' | 'createdAt'> & {
  createdAt?: number;
};
