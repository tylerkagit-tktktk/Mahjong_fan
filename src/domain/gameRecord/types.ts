export type QuarterUnit = number;

export type SeatIndex = 0 | 1 | 2 | 3;

export type CanonicalGameLifecycle = 'draft' | 'active' | 'ended' | 'abandoned';

export type CanonicalPlayer = {
  id: string;
  displayName: string;
};

export type CanonicalSeatAssignment = {
  seatIndex: SeatIndex;
  playerId: string;
};

export type CanonicalHkRules = {
  variant: 'HK';
  scoringPreset: 'traditionalFan' | 'customTable';
  gunMode: 'halfGun' | 'fullGun';
  stakePreset: 'TWO_FIVE_CHICKEN' | 'FIVE_ONE' | 'ONE_TWO';
  minFanToWin: number;
  unitPerFan: number;
  capFan: number | null;
  currencySymbol: string;
};

export type CanonicalRulesSnapshot = CanonicalHkRules | {
  variant: string;
  raw: unknown;
};

export type CanonicalHandOutcome = 'zimo' | 'discard' | 'draw';

export type CanonicalHandInput = {
  entryType: 'hand';
  id: string;
  handIndex: number;
  occurredAt: number;
  dealerSeatIndex: SeatIndex;
  outcome: CanonicalHandOutcome;
  fan: number | null;
  winnerPlayerId: string | null;
  discarderPlayerId: string | null;
  drawDealerAction: 'stick' | 'pass' | null;
  /** Existing stored settlement, when present; replay must validate rather than trust it. */
  persistedDeltasQ: readonly number[] | null;
};

export type CanonicalSeatBoundary = {
  entryType: 'seat-boundary';
  id: string;
  effectiveFromHandIndex: number;
  occurredAt: number;
  seats: readonly CanonicalSeatAssignment[];
};

export type CanonicalTimelineEntry = CanonicalHandInput | CanonicalSeatBoundary;

export type CanonicalGameRecordSnapshot = {
  gameId: string;
  lifecycle: CanonicalGameLifecycle;
  rules: CanonicalRulesSnapshot;
  players: readonly CanonicalPlayer[];
  initialSeats: readonly CanonicalSeatAssignment[];
  /** Required even for an empty timeline, so replay can derive the first and next dealer. */
  startingDealerSeatIndex: SeatIndex;
  timeline: readonly CanonicalTimelineEntry[];
};

export type ReplayOptions = {
  validatePersistedDeltas?: boolean;
  allowTerminalLifecycle?: boolean;
};

export type ReplayValidationCode =
  | 'INVALID_PLAYER_COUNT'
  | 'DUPLICATE_PLAYER_IDENTITY'
  | 'DUPLICATE_SEAT_IDENTITY'
  | 'INVALID_HAND_INDEX'
  | 'NON_SEQUENTIAL_HAND_INDEX'
  | 'UNKNOWN_WINNER'
  | 'UNKNOWN_DISCARDER'
  | 'WINNER_EQUALS_DISCARDER'
  | 'INVALID_FAN_VALUE'
  | 'BELOW_MINIMUM_FAN'
  | 'INVALID_DRAW_ACTION'
  | 'NON_ZERO_SUM_SETTLEMENT'
  | 'MALFORMED_STORED_DELTAS'
  | 'INVALID_SEAT_BOUNDARY'
  | 'STORED_SETTLEMENT_MISMATCH'
  | 'DEALER_STATE_MISMATCH'
  | 'HAND_AFTER_TERMINAL_LIFECYCLE'
  | 'CORRECTION_TARGET_NOT_LAST_EFFECTIVE_EVENT'
  | 'UNSUPPORTED_RULE_VARIANT'
  | 'CORRUPTED_RULES_SNAPSHOT';

export type ReplayValidationIssue = {
  code: ReplayValidationCode;
  entryId?: string;
  timelineIndex?: number;
  handIndex?: number;
  detail?: string;
};

export type ReplayRoundProjection = {
  dealerSeatIndex: SeatIndex;
  dealerAdvanceCount: number;
  roundIndex: number;
  wind: '東' | '南' | '西' | '北';
  dealerWind: '東' | '南' | '西' | '北';
  /** Always denotes the next hand, never the hand just completed. */
  nextRoundLabelZh: string;
};

export type ReplayHandProjection = {
  source: CanonicalHandInput;
  effectiveSeats: readonly CanonicalSeatAssignment[];
  /** Dealer derived from preceding canonical timeline state, not the persisted source snapshot. */
  derivedDealerSeatIndex: SeatIndex | null;
  deltasQ: readonly [QuarterUnit, QuarterUnit, QuarterUnit, QuarterUnit] | null;
  settlementDirections: readonly ReplaySettlementDirection[];
  roundAfterHand: ReplayRoundProjection | null;
  validationIssues: readonly ReplayValidationIssue[];
};

export type ReplayPlayerProjection = {
  playerId: string;
  displayName: string;
  totalQ: QuarterUnit;
  wins: number;
  zimoCount: number;
  discardCount: number;
};

export type ReplayStatistics = {
  handsCount: number;
  draws: number;
  zeroSum: boolean;
  mostDiscarderPlayerId: string | null;
  mostZimoPlayerId: string | null;
};

export type ReplayRankingEntry = {
  playerId: string;
  displayName: string;
  totalQ: QuarterUnit;
};

export type ReplaySettlementDirection = {
  handIndex: number;
  fromPlayerId: string;
  toPlayerId: string;
  amountQ: QuarterUnit;
};

/** Storage-independent data needed to build a result cache; it intentionally has no UI-formatted text. */
export type ReplayResultSummary = {
  winnerPlayerId: string | null;
  loserPlayerId: string | null;
  seatTotalsQ: readonly [QuarterUnit, QuarterUnit, QuarterUnit, QuarterUnit];
  playerTotalsQ: Readonly<Record<string, QuarterUnit>>;
  playersCount: number;
};

export type ReplayResult = {
  source: CanonicalGameRecordSnapshot;
  isValid: boolean;
  handProjections: readonly ReplayHandProjection[];
  players: readonly ReplayPlayerProjection[];
  ranking: readonly ReplayRankingEntry[];
  settlementDirections: readonly ReplaySettlementDirection[];
  finalSeats: readonly CanonicalSeatAssignment[] | null;
  finalRound: ReplayRoundProjection | null;
  statistics: ReplayStatistics | null;
  /** Null whenever a validation issue makes a persistence-ready cache unsafe. */
  summary: ReplayResultSummary | null;
  validationIssues: readonly ReplayValidationIssue[];
};

export type CorrectionAction = 'replace' | 'remove';

export type RevisionRecord = {
  id: string;
  action: CorrectionAction;
  targetHandId: string;
  targetHandIndex: number;
  before: CanonicalHandInput;
  after: CanonicalHandInput | null;
  editedBy: string;
  editedAt: number;
  baseVersion: number;
  serverVersion: number;
  reason?: string | null;
};
