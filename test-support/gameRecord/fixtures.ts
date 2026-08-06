import { GameBundle, Hand, Player } from '../../src/models/db';
import { RulesV1 } from '../../src/models/rules';

export const FIXED_GAME_ID = 'golden-game-001';
export const FIXED_CREATED_AT = 1_700_000_000_000;

export const GOLDEN_PLAYERS: Player[] = [
  { id: 'player-east', gameId: FIXED_GAME_ID, name: 'East', seatIndex: 0 },
  { id: 'player-south', gameId: FIXED_GAME_ID, name: 'South', seatIndex: 1 },
  { id: 'player-west', gameId: FIXED_GAME_ID, name: 'West', seatIndex: 2 },
  { id: 'player-north', gameId: FIXED_GAME_ID, name: 'North', seatIndex: 3 },
];

export function traditionalRules(overrides: Partial<RulesV1['hk']> & { minFanToWin?: number } = {}): RulesV1 {
  return {
    version: 1,
    variant: 'HK',
    mode: 'HK',
    languageDefault: 'zh-Hant',
    currencyCode: 'HKD',
    currencySymbol: 'HK$',
    seats: { order: ['E', 'S', 'W', 'N'] },
    minFanToWin: overrides.minFanToWin ?? 3,
    hk: {
      scoring: 'fan',
      scoringPreset: 'traditionalFan',
      gunMode: overrides.gunMode ?? 'halfGun',
      stakePreset: overrides.stakePreset ?? 'TWO_FIVE_CHICKEN',
      unitPerFan: overrides.unitPerFan ?? 1,
      capFan: overrides.capFan ?? null,
      applyDealerMultiplier: overrides.applyDealerMultiplier ?? true,
    },
    settlement: { mode: 'immediate' },
  };
}

export function customRules(overrides: Partial<RulesV1['hk']> & { minFanToWin?: number } = {}): RulesV1 {
  return {
    ...traditionalRules({ minFanToWin: overrides.minFanToWin ?? 3 }),
    hk: {
      scoring: 'fan',
      scoringPreset: 'customTable',
      gunMode: overrides.gunMode ?? 'fullGun',
      stakePreset: overrides.stakePreset ?? 'TWO_FIVE_CHICKEN',
      unitPerFan: overrides.unitPerFan ?? 0.5,
      capFan: overrides.capFan ?? 5,
      applyDealerMultiplier: overrides.applyDealerMultiplier ?? true,
    },
  };
}

export type SettlementGoldenFixture = {
  id: string;
  rules: RulesV1;
  fan: number;
  settlementType: 'zimo' | 'discard';
  winnerSeatIndex: 0 | 1 | 2 | 3;
  discarderSeatIndex: 0 | 1 | 2 | 3 | null;
  expectedDeltasQ: [number, number, number, number];
  expectedEffectiveFan: number;
};

export const SETTLEMENT_FIXTURES: SettlementGoldenFixture[] = [
  {
    id: 'dealer-zimo-stays',
    rules: traditionalRules({ gunMode: 'fullGun' }),
    fan: 3,
    settlementType: 'zimo',
    winnerSeatIndex: 0,
    discarderSeatIndex: null,
    expectedDeltasQ: [48, -16, -16, -16],
    expectedEffectiveFan: 3,
  },
  {
    id: 'half-gun-discard',
    rules: traditionalRules({ gunMode: 'halfGun' }),
    fan: 3,
    settlementType: 'discard',
    winnerSeatIndex: 0,
    discarderSeatIndex: 1,
    expectedDeltasQ: [32, -16, -8, -8],
    expectedEffectiveFan: 3,
  },
  {
    id: 'full-gun-discard',
    rules: traditionalRules({ gunMode: 'fullGun' }),
    fan: 3,
    settlementType: 'discard',
    winnerSeatIndex: 0,
    discarderSeatIndex: 1,
    expectedDeltasQ: [32, -32, 0, 0],
    expectedEffectiveFan: 3,
  },
  {
    id: 'custom-linear-cap',
    rules: customRules({ unitPerFan: 0.5, capFan: 5 }),
    fan: 7,
    settlementType: 'discard',
    winnerSeatIndex: 0,
    discarderSeatIndex: 1,
    expectedDeltasQ: [20, -20, 0, 0],
    expectedEffectiveFan: 5,
  },
  {
    id: 'traditional-thirteen-fan',
    rules: traditionalRules({ gunMode: 'fullGun', capFan: null, minFanToWin: 0 }),
    fan: 13,
    settlementType: 'discard',
    winnerSeatIndex: 0,
    discarderSeatIndex: 1,
    expectedDeltasQ: [1536, -1536, 0, 0],
    expectedEffectiveFan: 13,
  },
  {
    id: 'traditional-cap-ten',
    rules: traditionalRules({ gunMode: 'fullGun', capFan: 10, minFanToWin: 0 }),
    fan: 13,
    settlementType: 'discard',
    winnerSeatIndex: 0,
    discarderSeatIndex: 1,
    expectedDeltasQ: [512, -512, 0, 0],
    expectedEffectiveFan: 10,
  },
];

function hand(input: {
  id: string;
  handIndex: number;
  dealerSeatIndex: number;
  isDraw?: boolean;
  winnerSeatIndex?: number | null;
  winnerPlayerId?: string | null;
  discarderPlayerId?: string | null;
  deltasQ: [number, number, number, number];
  nextRoundLabelZh: string;
  settlementType?: 'zimo' | 'discard' | 'draw';
  dealerAction?: 'stick' | 'pass';
}): Hand {
  return {
    id: input.id,
    gameId: FIXED_GAME_ID,
    handIndex: input.handIndex,
    dealerSeatIndex: input.dealerSeatIndex,
    windIndex: 0,
    roundNumber: 1,
    isDraw: input.isDraw ?? false,
    winnerSeatIndex: input.winnerSeatIndex ?? null,
    type: input.isDraw ? 'draw' : 'fan',
    winnerPlayerId: input.winnerPlayerId ?? null,
    discarderPlayerId: input.discarderPlayerId ?? null,
    inputValue: 0,
    deltasJson: JSON.stringify(input.deltasQ),
    nextRoundLabelZh: input.nextRoundLabelZh,
    computedJson: JSON.stringify({
      settlementType: input.settlementType ?? (input.isDraw ? 'draw' : 'discard'),
      ...(input.dealerAction ? { dealerAction: input.dealerAction } : {}),
    }),
    createdAt: FIXED_CREATED_AT + input.handIndex * 1_000,
  };
}

export const EMPTY_GAME_BUNDLE: GameBundle = {
  game: {
    id: FIXED_GAME_ID,
    title: 'Golden empty game',
    createdAt: FIXED_CREATED_AT,
    currencySymbol: 'HK$',
    variant: 'HK',
    rulesJson: JSON.stringify(traditionalRules()),
    startingDealerSeatIndex: 0,
    progressIndex: 0,
    currentWindIndex: 0,
    currentRoundNumber: 1,
    maxWindIndex: 1,
    seatRotationOffset: 0,
    gameState: 'draft',
    currentRoundLabelZh: '東風東局',
    endedAt: null,
    handsCount: 0,
    resultStatus: 'none',
    resultSummaryJson: null,
    resultUpdatedAt: null,
  },
  players: GOLDEN_PLAYERS,
  hands: [],
};

export const DRAW_STAY_HAND = hand({
  id: 'hand-draw-stay',
  handIndex: 0,
  dealerSeatIndex: 0,
  isDraw: true,
  deltasQ: [0, 0, 0, 0],
  nextRoundLabelZh: '東風東局',
  dealerAction: 'stick',
});

export const DRAW_PASS_HAND = hand({
  id: 'hand-draw-pass',
  handIndex: 0,
  dealerSeatIndex: 0,
  isDraw: true,
  deltasQ: [0, 0, 0, 0],
  nextRoundLabelZh: '東風南局',
  dealerAction: 'pass',
});

export const NEXT_WIND_HANDS: Hand[] = [
  hand({ id: 'wind-0', handIndex: 0, dealerSeatIndex: 0, winnerSeatIndex: 1, deltasQ: [32, -32, 0, 0], nextRoundLabelZh: '東風南局', winnerPlayerId: 'player-south', discarderPlayerId: 'player-east' }),
  hand({ id: 'wind-1', handIndex: 1, dealerSeatIndex: 1, winnerSeatIndex: 2, deltasQ: [0, 32, -32, 0], nextRoundLabelZh: '東風西局', winnerPlayerId: 'player-west', discarderPlayerId: 'player-south' }),
  hand({ id: 'wind-2', handIndex: 2, dealerSeatIndex: 2, winnerSeatIndex: 3, deltasQ: [0, 0, 32, -32], nextRoundLabelZh: '東風北局', winnerPlayerId: 'player-north', discarderPlayerId: 'player-west' }),
  hand({ id: 'wind-3', handIndex: 3, dealerSeatIndex: 3, winnerSeatIndex: 0, deltasQ: [-32, 0, 0, 32], nextRoundLabelZh: '南風東局', winnerPlayerId: 'player-east', discarderPlayerId: 'player-north' }),
];

export const ALL_DRAW_HANDS: Hand[] = [0, 1, 2, 3].map((handIndex) => hand({
  id: `all-draw-${handIndex}`,
  handIndex,
  dealerSeatIndex: 0,
  isDraw: true,
  deltasQ: [0, 0, 0, 0],
  nextRoundLabelZh: '東風東局',
  dealerAction: 'stick',
}));

export const RESEAT_BOUNDARY_HANDS: Hand[] = [
  hand({ id: 'reseat-wrap', handIndex: 0, dealerSeatIndex: 3, winnerSeatIndex: 0, deltasQ: [16, -16, 0, 0], nextRoundLabelZh: '東風東局', winnerPlayerId: 'player-east', discarderPlayerId: 'player-south' }),
  hand({ id: 'reseat-after-wrap', handIndex: 1, dealerSeatIndex: 0, winnerSeatIndex: 0, deltasQ: [16, -16, 0, 0], nextRoundLabelZh: '東風東局', winnerPlayerId: 'player-north', discarderPlayerId: 'player-east' }),
];

export const ENDED_RESULT_BUNDLE: GameBundle = {
  game: {
    ...EMPTY_GAME_BUNDLE.game,
    title: 'Golden ended game',
    gameState: 'ended',
    endedAt: FIXED_CREATED_AT + 2_000,
    handsCount: 2,
    resultStatus: 'result',
    currentRoundLabelZh: '東風西局',
  },
  players: GOLDEN_PLAYERS,
  hands: [
    hand({ id: 'ended-discard', handIndex: 0, dealerSeatIndex: 0, winnerSeatIndex: 0, deltasQ: [32, -32, 0, 0], nextRoundLabelZh: '東風南局', winnerPlayerId: 'player-east', discarderPlayerId: 'player-south' }),
    hand({ id: 'ended-zimo', handIndex: 1, dealerSeatIndex: 1, winnerSeatIndex: 2, deltasQ: [-16, -16, 48, -16], nextRoundLabelZh: '東風西局', settlementType: 'zimo', winnerPlayerId: 'player-west' }),
  ],
};

export const MALFORMED_STORED_HAND_FIXTURE = {
  id: 'malformed-non-zero-sum',
  handIndex: 0,
  persistedDeltasQ: [16, -8, -4, -2],
  expectedFutureValidationCode: 'NON_ZERO_SUM_SETTLEMENT',
} as const;
