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
  /** @deprecated Legacy progression snapshot; do not use for runtime round label. */
  progressIndex: number;
  /** @deprecated Legacy progression snapshot; do not use for runtime round label. */
  currentWindIndex: number;
  /** @deprecated Legacy progression snapshot; do not use for runtime round label. */
  currentRoundNumber: number;
  /** @deprecated Legacy progression snapshot; do not use for runtime round label. */
  maxWindIndex: number;
  seatRotationOffset?: number;
  gameState: 'draft' | 'active' | 'ended' | 'abandoned';
  currentRoundLabelZh?: string | null;
  endedAt?: number | null;
  handsCount?: number;
  resultStatus?: 'none' | 'result' | 'abandoned' | null;
  resultSummaryJson?: string | null;
  resultUpdatedAt?: number | null;
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
  windIndex: number;
  roundNumber: number;
  isDraw: boolean;
  winnerSeatIndex?: number | null;
  type: string;
  winnerPlayerId?: string | null;
  discarderPlayerId?: string | null;
  inputValue?: number | null;
  deltasJson?: string | null;
  nextRoundLabelZh?: string | null;
  computedJson: string;
  createdAt: number;
};

export type GameBundle = {
  game: Game;
  players: Player[];
  hands: Hand[];
};

export type NewGameInput = Omit<
  Game,
  'createdAt' | 'currentWindIndex' | 'currentRoundNumber' | 'maxWindIndex'
> & {
  createdAt?: number;
  progressIndex?: number;
  currentWindIndex?: number;
  currentRoundNumber?: number;
  maxWindIndex?: number;
  seatRotationOffset?: number;
};
export type NewPlayerInput = Player;
export type NewHandInput = Omit<
  Hand,
  'handIndex' | 'createdAt' | 'windIndex' | 'roundNumber' | 'nextRoundLabelZh'
> & {
  createdAt?: number;
  discarderSeatIndex?: number | null;
};
