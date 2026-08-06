export type Rules = {
  version?: number;
  payload?: Record<string, unknown>;
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
  /** Schema 301+: whether seat history is complete persisted data or legacy-compatible inference. */
  seatBoundaryHistoryMode?: 'legacy_inferred' | 'explicit';
  /** Schema 301+: immutable player identity mapping at game creation, serialized by seat index. */
  initialSeatMappingJson?: string | null;
  /** Schema 303+: shared committed order for local hand and lifecycle record mutations. */
  recordMutationVersion?: number;
  gameState: 'draft' | 'active' | 'ended' | 'abandoned';
  currentRoundLabelZh?: string | null;
  endedAt?: number | null;
  handsCount?: number;
  resultStatus?: 'none' | 'result' | 'abandoned' | null;
  resultSummaryJson?: string | null;
  resultUpdatedAt?: number | null;
  languageOverride?: string | null;
};

export type LocalSeatBoundaryReason = 'confirmed_reseat';

export type LocalSeatBoundary = {
  id: string;
  gameId: string;
  effectiveFromHandIndex: number;
  /** Complete post-boundary mapping, keyed by canonical seat index 0..3. */
  seatMapping: Record<number, string>;
  reason: LocalSeatBoundaryReason;
  createdAt: number;
};

export type LocalHandRevisionAction = 'replace' | 'remove';

/** Immutable raw storage snapshot, intentionally independent from UI hand-entry inputs. */
export type LocalHandRevisionSnapshotV1 = {
  version: 1;
  hand: Hand;
};

export type LocalHandRevision = {
  id: string;
  gameId: string;
  revisionIndex: number;
  action: LocalHandRevisionAction;
  targetHandId: string;
  targetHandIndex: number;
  before: LocalHandRevisionSnapshotV1;
  after: LocalHandRevisionSnapshotV1 | null;
  actorType: 'local_user';
  actorId: string | null;
  reason: string | null;
  createdAt: number;
  recordMutationVersion: number;
};

export type LocalGameLifecycleRevisionAction = 'reopen';

export type LocalGameLifecycleSnapshotV1 = {
  version: 1;
  game: Game;
};

export type LocalGameLifecycleRevision = {
  id: string;
  gameId: string;
  lifecycleRevisionIndex: number;
  recordMutationVersion: number;
  action: LocalGameLifecycleRevisionAction;
  before: LocalGameLifecycleSnapshotV1;
  after: LocalGameLifecycleSnapshotV1;
  actorType: 'local_user';
  actorId: string | null;
  reason: string | null;
  createdAt: number;
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
  /** Optional only for source compatibility; repository reads always provide an ordered array. */
  seatBoundaries?: LocalSeatBoundary[];
};

export type NewGameInput = Omit<
  Game,
  | 'createdAt'
  | 'progressIndex'
  | 'currentWindIndex'
  | 'currentRoundNumber'
  | 'maxWindIndex'
  | 'gameState'
  | 'currentRoundLabelZh'
  | 'endedAt'
  | 'handsCount'
  | 'resultStatus'
  | 'resultSummaryJson'
  | 'resultUpdatedAt'
  | 'recordMutationVersion'
> & {
  createdAt?: number;
  progressIndex?: number;
  currentWindIndex?: number;
  currentRoundNumber?: number;
  maxWindIndex?: number;
  seatRotationOffset?: number;
  gameState?: Game['gameState'];
  currentRoundLabelZh?: string | null;
  endedAt?: number | null;
  handsCount?: number;
  resultStatus?: Game['resultStatus'];
  resultSummaryJson?: string | null;
  resultUpdatedAt?: number | null;
};
export type NewPlayerInput = Player;
export type NewHandInput = Omit<
  Hand,
  'handIndex' | 'createdAt' | 'windIndex' | 'roundNumber' | 'nextRoundLabelZh'
> & {
  createdAt?: number;
  discarderSeatIndex?: number | null;
};
