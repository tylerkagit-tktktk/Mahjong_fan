import { buildGameResultSummarySnapshot } from '../../../src/db/repo';
import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import { replayGameRecord } from '../../../src/domain/gameRecord/replay';
import {
  CanonicalGameLifecycle,
  CanonicalGameRecordSnapshot,
  CanonicalHandInput,
  CanonicalHandOutcome,
  CanonicalHkRules,
  CanonicalSeatAssignment,
  ReplayValidationCode,
  SeatIndex,
} from '../../../src/domain/gameRecord/types';
import { RulesV1 } from '../../../src/models/rules';
import {
  ALL_DRAW_HANDS,
  DRAW_PASS_HAND,
  DRAW_STAY_HAND,
  EMPTY_GAME_BUNDLE,
  ENDED_RESULT_BUNDLE,
  FIXED_CREATED_AT,
  GOLDEN_PLAYERS,
  NEXT_WIND_HANDS,
  RESEAT_BOUNDARY_HANDS,
  SETTLEMENT_FIXTURES,
  traditionalRules,
} from '../../../test-support/gameRecord/fixtures';

const initialSeats: CanonicalSeatAssignment[] = GOLDEN_PLAYERS
  .map((player) => ({ seatIndex: player.seatIndex as SeatIndex, playerId: player.id }))
  .sort((left, right) => left.seatIndex - right.seatIndex);

function toCanonicalRules(rules: RulesV1): CanonicalHkRules {
  if (!rules.hk) {
    throw new Error('Test fixture must contain HK rules.');
  }
  return {
    variant: 'HK',
    scoringPreset: rules.hk.scoringPreset,
    gunMode: rules.hk.gunMode,
    stakePreset: rules.hk.stakePreset,
    minFanToWin: rules.minFanToWin ?? 0,
    unitPerFan: rules.hk.unitPerFan ?? 1,
    capFan: rules.hk.capFan ?? null,
    currencySymbol: rules.currencySymbol,
  };
}

function playerIdAtSeat(seatIndex: SeatIndex, seats = initialSeats): string {
  const playerId = seats.find((seat) => seat.seatIndex === seatIndex)?.playerId;
  if (!playerId) {
    throw new Error(`No player at seat ${seatIndex}.`);
  }
  return playerId;
}

function hand(input: {
  id: string;
  handIndex: number;
  dealerSeatIndex: SeatIndex;
  outcome: CanonicalHandOutcome;
  rules: RulesV1;
  fan?: number | null;
  winnerSeatIndex?: SeatIndex;
  discarderSeatIndex?: SeatIndex;
  drawDealerAction?: 'stick' | 'pass' | null;
  seats?: CanonicalSeatAssignment[];
  persistedDeltasQ?: readonly number[] | null;
}): CanonicalHandInput {
  const seats = input.seats ?? initialSeats;
  const winnerPlayerId = input.winnerSeatIndex === undefined ? null : playerIdAtSeat(input.winnerSeatIndex, seats);
  const discarderPlayerId = input.discarderSeatIndex === undefined ? null : playerIdAtSeat(input.discarderSeatIndex, seats);
  const fan = input.outcome === 'draw' ? null : input.fan ?? 3;
  const persistedDeltasQ = input.persistedDeltasQ ?? (
    input.outcome === 'draw'
      ? [0, 0, 0, 0]
      : computeHkSettlement({
          rules: input.rules,
          fan: fan as number,
          settlementType: input.outcome,
          winnerSeatIndex: input.winnerSeatIndex as SeatIndex,
          discarderSeatIndex: input.outcome === 'discard' ? input.discarderSeatIndex ?? null : null,
        }).deltasQ
  );
  return {
    entryType: 'hand',
    id: input.id,
    handIndex: input.handIndex,
    occurredAt: FIXED_CREATED_AT + input.handIndex * 1_000,
    dealerSeatIndex: input.dealerSeatIndex,
    outcome: input.outcome,
    fan,
    winnerPlayerId,
    discarderPlayerId,
    drawDealerAction: input.outcome === 'draw' ? input.drawDealerAction ?? 'stick' : null,
    persistedDeltasQ,
  };
}

function record(input: {
  rules?: RulesV1;
  startingDealerSeatIndex?: SeatIndex;
  lifecycle?: CanonicalGameLifecycle;
  timeline?: CanonicalGameRecordSnapshot['timeline'];
} = {}): CanonicalGameRecordSnapshot {
  const rules = input.rules ?? traditionalRules();
  return {
    gameId: EMPTY_GAME_BUNDLE.game.id,
    lifecycle: input.lifecycle ?? 'active',
    rules: toCanonicalRules(rules),
    players: GOLDEN_PLAYERS.map((player) => ({ id: player.id, displayName: player.name })),
    initialSeats,
    startingDealerSeatIndex: input.startingDealerSeatIndex ?? 0,
    timeline: input.timeline ?? [],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validationCodes(input: CanonicalGameRecordSnapshot): ReplayValidationCode[] {
  return replayGameRecord(input).validationIssues.map((issue) => issue.code);
}

function expectValidationCode(input: CanonicalGameRecordSnapshot, expectedCode: ReplayValidationCode) {
  expect(() => replayGameRecord(input)).not.toThrow();
  expect(validationCodes(input)).toContain(expectedCode);
}

describe('canonical replay golden parity', () => {
  it('replays an empty fixture into its first next-hand state', () => {
    const result = replayGameRecord(record({ lifecycle: 'draft' }));

    expect(result.isValid).toBe(true);
    expect(result.handProjections).toEqual([]);
    expect(result.finalRound?.nextRoundLabelZh).toBe(EMPTY_GAME_BUNDLE.game.currentRoundLabelZh);
    expect(result.players.map((player) => player.totalQ)).toEqual([0, 0, 0, 0]);
  });

  it.each(SETTLEMENT_FIXTURES)('$id exactly matches the existing HK settlement fixture', (fixture) => {
    const outcome: CanonicalHandOutcome = fixture.settlementType;
    const result = replayGameRecord(record({
      rules: fixture.rules,
      timeline: [hand({
        id: fixture.id,
        handIndex: 0,
        dealerSeatIndex: 0,
        outcome,
        rules: fixture.rules,
        fan: fixture.fan,
        winnerSeatIndex: fixture.winnerSeatIndex,
        ...(fixture.discarderSeatIndex === null ? {} : { discarderSeatIndex: fixture.discarderSeatIndex }),
        persistedDeltasQ: fixture.expectedDeltasQ,
      })],
    }));

    expect(result.isValid).toBe(true);
    expect(result.handProjections[0].deltasQ).toEqual(fixture.expectedDeltasQ);
    expect(result.handProjections[0].deltasQ?.reduce((total, value) => total + value, 0)).toBe(0);
  });

  it('keeps a dealer zimo on the dealer and advances after a non-dealer win', () => {
    const rules = traditionalRules({ gunMode: 'fullGun' });
    const dealerZimo = replayGameRecord(record({
      rules,
      timeline: [hand({
        id: 'dealer-zimo', handIndex: 0, dealerSeatIndex: 0, outcome: 'zimo', rules, fan: 3, winnerSeatIndex: 0,
      })],
    }));
    const nonDealerWin = replayGameRecord(record({
      rules,
      timeline: [hand({
        id: 'non-dealer-win', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, fan: 3, winnerSeatIndex: 1, discarderSeatIndex: 0,
      })],
    }));

    expect(dealerZimo.handProjections[0].roundAfterHand?.dealerSeatIndex).toBe(0);
    expect(dealerZimo.finalRound?.nextRoundLabelZh).toBe('東風東局');
    expect(nonDealerWin.handProjections[0].roundAfterHand?.dealerSeatIndex).toBe(1);
    expect(nonDealerWin.finalRound?.nextRoundLabelZh).toBe('東風南局');
  });

  it('matches draw stay and pass fixtures', () => {
    const rules = traditionalRules();
    const stay = replayGameRecord(record({
      rules,
      timeline: [hand({
        id: DRAW_STAY_HAND.id, handIndex: DRAW_STAY_HAND.handIndex, dealerSeatIndex: 0, outcome: 'draw', rules, drawDealerAction: 'stick',
      })],
    }));
    const pass = replayGameRecord(record({
      rules,
      timeline: [hand({
        id: DRAW_PASS_HAND.id, handIndex: DRAW_PASS_HAND.handIndex, dealerSeatIndex: 0, outcome: 'draw', rules, drawDealerAction: 'pass',
      })],
    }));

    expect(stay.finalRound?.nextRoundLabelZh).toBe(DRAW_STAY_HAND.nextRoundLabelZh);
    expect(pass.finalRound?.nextRoundLabelZh).toBe(DRAW_PASS_HAND.nextRoundLabelZh);
    expect(stay.handProjections[0].deltasQ).toEqual([0, 0, 0, 0]);
  });

  it('advances through four dealers into the next wind without re-replaying history', () => {
    const rules = traditionalRules({ gunMode: 'fullGun' });
    let dealerSeatIndex: SeatIndex = 0;
    const timeline = NEXT_WIND_HANDS.map((fixtureHand, handIndex) => {
      const winnerSeatIndex = ((dealerSeatIndex + 1) % 4) as SeatIndex;
      const next = hand({
        id: fixtureHand.id,
        handIndex,
        dealerSeatIndex,
        outcome: 'discard',
        rules,
        fan: 3,
        winnerSeatIndex,
        discarderSeatIndex: dealerSeatIndex,
      });
      dealerSeatIndex = winnerSeatIndex;
      return next;
    });
    const result = replayGameRecord(record({ rules, timeline }));

    expect(result.isValid).toBe(true);
    expect(result.handProjections.map((projection) => projection.roundAfterHand?.nextRoundLabelZh)).toEqual([
      '東風南局', '東風西局', '東風北局', '南風東局',
    ]);
    expect(result.finalRound?.nextRoundLabelZh).toBe('南風東局');
  });

  it('keeps all-draw totals at zero and counts draw statistics', () => {
    const rules = traditionalRules();
    const timeline = ALL_DRAW_HANDS.map((fixtureHand) => hand({
      id: fixtureHand.id,
      handIndex: fixtureHand.handIndex,
      dealerSeatIndex: 0,
      outcome: 'draw',
      rules,
      drawDealerAction: 'stick',
    }));
    const result = replayGameRecord(record({ rules, lifecycle: 'ended', timeline }));

    expect(result.isValid).toBe(true);
    expect(result.statistics).toMatchObject({ handsCount: 4, draws: 4, zeroSum: true });
    expect(result.players.map((player) => player.totalQ)).toEqual([0, 0, 0, 0]);
  });

  it('uses the existing name-based tie ordering for equal totals', () => {
    const result = replayGameRecord(record({ lifecycle: 'ended' }));

    expect(result.ranking.map((entry) => entry.displayName)).toEqual(['East', 'North', 'South', 'West']);
  });

  it('uses an explicit boundary to preserve player identity totals across a reseat', () => {
    const rules = traditionalRules({ gunMode: 'fullGun' });
    const rotatedSeats: CanonicalSeatAssignment[] = [
      { seatIndex: 0, playerId: 'player-north' },
      { seatIndex: 1, playerId: 'player-east' },
      { seatIndex: 2, playerId: 'player-south' },
      { seatIndex: 3, playerId: 'player-west' },
    ];
    const result = replayGameRecord(record({
      rules,
      timeline: [
        hand({
          id: RESEAT_BOUNDARY_HANDS[0].id, handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, fan: 3, winnerSeatIndex: 0, discarderSeatIndex: 1,
        }),
        {
          entryType: 'seat-boundary',
          id: 'explicit-reseat',
          effectiveFromHandIndex: 1,
          occurredAt: FIXED_CREATED_AT + 500,
          seats: rotatedSeats,
        },
        hand({
          id: RESEAT_BOUNDARY_HANDS[1].id, handIndex: 1, dealerSeatIndex: 0, outcome: 'discard', rules, fan: 3, winnerSeatIndex: 0, discarderSeatIndex: 1, seats: rotatedSeats,
        }),
      ],
    }));

    expect(result.isValid).toBe(true);
    expect(result.players.map((player) => [player.playerId, player.totalQ])).toEqual([
      ['player-east', 0],
      ['player-south', -32],
      ['player-west', 0],
      ['player-north', 32],
    ]);
    expect(result.handProjections[1].effectiveSeats).toEqual(rotatedSeats);
    expect(result.finalSeats).toEqual(rotatedSeats);
  });

  it('matches the existing ended ranking, statistics, and result-summary values with derived deltas', () => {
    const rules = traditionalRules({ gunMode: 'fullGun' });
    const result = replayGameRecord(record({
      rules,
      lifecycle: 'ended',
      startingDealerSeatIndex: 3,
      timeline: [
        hand({
          id: ENDED_RESULT_BUNDLE.hands[0].id, handIndex: 0, dealerSeatIndex: 3, outcome: 'discard', rules, fan: 3, winnerSeatIndex: 0, discarderSeatIndex: 1,
        }),
        hand({
          id: ENDED_RESULT_BUNDLE.hands[1].id, handIndex: 1, dealerSeatIndex: 0, outcome: 'zimo', rules, fan: 3, winnerSeatIndex: 2,
        }),
      ],
    }));
    const existingSummary = buildGameResultSummarySnapshot(ENDED_RESULT_BUNDLE);

    expect(result.isValid).toBe(true);
    expect(result.ranking.map((entry) => [entry.displayName, entry.totalQ / 4])).toEqual([
      ['West', 12], ['East', 4], ['North', -4], ['South', -12],
    ]);
    expect(result.players.map((player) => [player.playerId, player.wins, player.zimoCount, player.discardCount])).toEqual([
      ['player-east', 1, 0, 0], ['player-south', 0, 0, 1], ['player-west', 1, 1, 0], ['player-north', 0, 0, 0],
    ]);
    expect(result.statistics).toMatchObject({ draws: 0, mostDiscarderPlayerId: 'player-south', mostZimoPlayerId: 'player-west' });
    expect(result.summary).toEqual({
      winnerPlayerId: 'player-west',
      loserPlayerId: 'player-south',
      seatTotalsQ: existingSummary.seatTotalsQ,
      playerTotalsQ: existingSummary.playerTotalsQ,
      playersCount: existingSummary.playersCount,
    });
    expect(result.settlementDirections).toContainEqual({
      handIndex: 0,
      fromPlayerId: 'player-south',
      toPlayerId: 'player-east',
      amountQ: 32,
    });
  });
});

describe('canonical replay validation', () => {
  it('reports invalid player counts, duplicate player IDs, and duplicate initial seats', () => {
    const tooFewPlayers = record();
    tooFewPlayers.players = tooFewPlayers.players.slice(0, 3);
    expectValidationCode(tooFewPlayers, 'INVALID_PLAYER_COUNT');

    const duplicatePlayer = record();
    duplicatePlayer.players = duplicatePlayer.players.map((player, index) => index === 1 ? { ...player, id: 'player-east' } : player);
    expectValidationCode(duplicatePlayer, 'DUPLICATE_PLAYER_IDENTITY');

    const duplicateSeat = record();
    duplicateSeat.initialSeats = [
      initialSeats[0], { seatIndex: 0, playerId: 'player-south' }, initialSeats[2], initialSeats[3],
    ];
    expectValidationCode(duplicateSeat, 'DUPLICATE_SEAT_IDENTITY');
  });

  it('accepts additional historical identities while every effective lineup remains exactly four seats', () => {
    const source = record();
    source.players = [...source.players, { id: 'historical-fifth', displayName: 'Fifth' }];

    const result = replayGameRecord(source);

    expect(result.isValid).toBe(true);
    expect(result.players).toHaveLength(5);
    expect(result.finalSeats).toEqual(initialSeats);
  });

  it('enforces a zero-based, continuous canonical hand index', () => {
    const rules = traditionalRules();
    for (const handIndex of [-1, 0.5]) {
      expectValidationCode(record({ rules, timeline: [hand({
        id: `invalid-index-${handIndex}`, handIndex, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1,
      })] }), 'INVALID_HAND_INDEX');
    }
    expectValidationCode(record({ rules, timeline: [hand({
      id: 'first-is-one', handIndex: 1, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1,
    })] }), 'NON_SEQUENTIAL_HAND_INDEX');
    expectValidationCode(record({ rules, timeline: [
      hand({ id: 'zero', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1 }),
      hand({ id: 'two', handIndex: 2, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1 }),
    ] }), 'NON_SEQUENTIAL_HAND_INDEX');
  });

  it('reports invalid player references and hand combinations', () => {
    const unknownWinner = record();
    (unknownWinner.timeline[0] as CanonicalHandInput | undefined) ??= hand({
      id: 'unknown-winner', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules: traditionalRules(), winnerSeatIndex: 0, discarderSeatIndex: 1,
    });
    (unknownWinner.timeline[0] as CanonicalHandInput).winnerPlayerId = 'missing-player';
    expectValidationCode(unknownWinner, 'UNKNOWN_WINNER');

    const unknownDiscarder = record({ rules: traditionalRules(), timeline: [hand({
      id: 'unknown-discarder', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules: traditionalRules(), winnerSeatIndex: 0, discarderSeatIndex: 1,
    })] });
    (unknownDiscarder.timeline[0] as CanonicalHandInput).discarderPlayerId = 'missing-player';
    expectValidationCode(unknownDiscarder, 'UNKNOWN_DISCARDER');

    const sameWinnerDiscarder = record({ rules: traditionalRules(), timeline: [hand({
      id: 'same-player', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules: traditionalRules(), winnerSeatIndex: 0, discarderSeatIndex: 1,
    })] });
    (sameWinnerDiscarder.timeline[0] as CanonicalHandInput).discarderPlayerId = 'player-east';
    expectValidationCode(sameWinnerDiscarder, 'WINNER_EQUALS_DISCARDER');
  });

  it('reports invalid fan, below-minimum fan, and invalid draw action', () => {
    const rules = traditionalRules();
    const invalidFan = record({ rules, timeline: [hand({
      id: 'fractional-fan', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, fan: 3.5, winnerSeatIndex: 0, discarderSeatIndex: 1, persistedDeltasQ: [0, 0, 0, 0],
    })] });
    expectValidationCode(invalidFan, 'INVALID_FAN_VALUE');

    const belowMinimum = record({ rules, timeline: [hand({
      id: 'below-minimum', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, fan: 2, winnerSeatIndex: 0, discarderSeatIndex: 1, persistedDeltasQ: [0, 0, 0, 0],
    })] });
    expectValidationCode(belowMinimum, 'BELOW_MINIMUM_FAN');

    const invalidDrawAction = record({ rules, timeline: [hand({
      id: 'invalid-draw-action', handIndex: 0, dealerSeatIndex: 0, outcome: 'draw', rules, drawDealerAction: 'stick',
    })] });
    (invalidDrawAction.timeline[0] as CanonicalHandInput).drawDealerAction = null;
    expectValidationCode(invalidDrawAction, 'INVALID_DRAW_ACTION');
  });

  it('distinguishes malformed, non-zero-sum, and mismatched persisted settlements', () => {
    const rules = traditionalRules();
    const malformed = record({ rules, timeline: [hand({
      id: 'malformed', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1, persistedDeltasQ: [1, 2, 3],
    })] });
    expectValidationCode(malformed, 'MALFORMED_STORED_DELTAS');

    const malformedPlayerShape = record({ rules, timeline: [hand({
      id: 'malformed-player-shape', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1,
      persistedDeltasQ: { 'player-east': 32, 'player-south': -32 } as unknown as readonly number[],
    })] });
    expectValidationCode(malformedPlayerShape, 'MALFORMED_STORED_DELTAS');

    const nonZeroSum = record({ rules, timeline: [hand({
      id: 'non-zero', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1, persistedDeltasQ: [8, -4, -2, -1],
    })] });
    expectValidationCode(nonZeroSum, 'NON_ZERO_SUM_SETTLEMENT');

    const mismatch = record({ rules, timeline: [hand({
      id: 'mismatch', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1, persistedDeltasQ: [0, 0, 0, 0],
    })] });
    const mismatchResult = replayGameRecord(mismatch);
    expect(mismatchResult.validationIssues.map((issue) => issue.code)).toContain('STORED_SETTLEMENT_MISMATCH');
    expect(mismatchResult.handProjections[0].deltasQ).toEqual([32, -16, -8, -8]);
    expect(mismatchResult.summary).toBeNull();
  });

  it('reports source dealer mismatch while retaining the replay-derived dealer', () => {
    const rules = traditionalRules();
    const source = record({ rules, timeline: [hand({
      id: 'dealer-mismatch', handIndex: 0, dealerSeatIndex: 1, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1,
    })] });
    const result = replayGameRecord(source);

    expect(result.validationIssues.map((issue) => issue.code)).toContain('DEALER_STATE_MISMATCH');
    expect(result.handProjections[0].derivedDealerSeatIndex).toBe(0);
    expect(result.handProjections[0].deltasQ).toEqual([32, -16, -8, -8]);
    expect(result.summary).toBeNull();
  });

  it('derives dealer state when a source format has no per-hand dealer snapshot', () => {
    const rules = traditionalRules();
    const source = record({ rules, timeline: [hand({
      id: 'dealer-not-stored', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 1, discarderSeatIndex: 0,
    })] });
    (source.timeline[0] as CanonicalHandInput).dealerSeatIndex = null;

    const result = replayGameRecord(source);

    expect(result.isValid).toBe(true);
    expect(result.handProjections[0].derivedDealerSeatIndex).toBe(0);
    expect(result.finalRound?.dealerSeatIndex).toBe(1);
    expect(result.validationIssues).toEqual([]);
  });

  it('orders validation codes stably within a timeline entry', () => {
    const source = record({ rules: traditionalRules(), timeline: [hand({
      id: 'stable-order', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules: traditionalRules(), winnerSeatIndex: 0, discarderSeatIndex: 1, persistedDeltasQ: [0, 0, 0, 0],
    })] });
    (source.timeline[0] as CanonicalHandInput).fan = 3.5;
    (source.timeline[0] as CanonicalHandInput).winnerPlayerId = 'missing-player';

    const result = replayGameRecord(source);

    expect(result.validationIssues.map((issue) => issue.code)).toEqual([
      'INVALID_FAN_VALUE',
      'UNKNOWN_WINNER',
    ]);
  });

  it('reports invalid boundary index, unknown player, and duplicate seat/player boundaries', () => {
    const rules = traditionalRules();
    const baseHand = hand({
      id: 'boundary-base', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1,
    });
    const invalidIndex = record({ rules, timeline: [baseHand, {
      entryType: 'seat-boundary', id: 'bad-index', effectiveFromHandIndex: 2, occurredAt: FIXED_CREATED_AT, seats: initialSeats,
    }] });
    expectValidationCode(invalidIndex, 'INVALID_SEAT_BOUNDARY');

    const unknownPlayer = record({ rules, timeline: [baseHand, {
      entryType: 'seat-boundary', id: 'unknown-player', effectiveFromHandIndex: 1, occurredAt: FIXED_CREATED_AT, seats: [
        { seatIndex: 0, playerId: 'missing' }, initialSeats[1], initialSeats[2], initialSeats[3],
      ],
    }] });
    expectValidationCode(unknownPlayer, 'INVALID_SEAT_BOUNDARY');

    const duplicateMapping = record({ rules, timeline: [baseHand, {
      entryType: 'seat-boundary', id: 'duplicate-seat', effectiveFromHandIndex: 1, occurredAt: FIXED_CREATED_AT, seats: [
        initialSeats[0], { seatIndex: 0, playerId: 'player-south' }, initialSeats[2], initialSeats[3],
      ],
    }] });
    expectValidationCode(duplicateMapping, 'INVALID_SEAT_BOUNDARY');

    const duplicatePlayer = record({ rules, timeline: [baseHand, {
      entryType: 'seat-boundary', id: 'duplicate-player', effectiveFromHandIndex: 1, occurredAt: FIXED_CREATED_AT, seats: [
        initialSeats[0], { seatIndex: 1, playerId: 'player-east' }, initialSeats[2], initialSeats[3],
      ],
    }] });
    expectValidationCode(duplicatePlayer, 'INVALID_SEAT_BOUNDARY');

    const outOfOrderBoundary = record({ rules, timeline: [
      baseHand,
      hand({ id: 'boundary-following-hand', handIndex: 1, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1 }),
      { entryType: 'seat-boundary', id: 'late-boundary', effectiveFromHandIndex: 1, occurredAt: FIXED_CREATED_AT, seats: initialSeats },
    ] });
    expectValidationCode(outOfOrderBoundary, 'INVALID_SEAT_BOUNDARY');
  });

  it('rejects unsupported and corrupted rules snapshots without uncontrolled throws', () => {
    const unsupported = clone(record()) as CanonicalGameRecordSnapshot;
    unsupported.rules = { variant: 'TW', raw: {} };
    expectValidationCode(unsupported, 'UNSUPPORTED_RULE_VARIANT');

    const corrupted = clone(record()) as CanonicalGameRecordSnapshot;
    corrupted.rules = { variant: 'HK' } as CanonicalHkRules;
    expectValidationCode(corrupted, 'CORRUPTED_RULES_SNAPSHOT');

    expect(() => replayGameRecord(null as unknown as CanonicalGameRecordSnapshot)).not.toThrow();
  });
});

describe('canonical replay determinism and timeline scale', () => {
  it('is deterministic, does not mutate nested input, and does not consult the clock', () => {
    const rules = traditionalRules();
    const input = record({ rules, timeline: [hand({
      id: 'purity', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', rules, winnerSeatIndex: 0, discarderSeatIndex: 1,
    })] });
    const before = clone(input);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1);

    const first = replayGameRecord(input);
    nowSpy.mockReturnValue(9_999_999);
    const second = replayGameRecord(input);

    expect(first).toEqual(second);
    expect(first.source).toBe(input);
    expect(input).toEqual(before);
    expect(nowSpy).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('replays a longer sequential timeline without recursion and preserves totals and next label', () => {
    const rules = traditionalRules({ gunMode: 'fullGun' });
    let dealerSeatIndex: SeatIndex = 0;
    const timeline: CanonicalHandInput[] = [];
    for (let handIndex = 0; handIndex < 128; handIndex += 1) {
      const winnerSeatIndex = ((dealerSeatIndex + 1) % 4) as SeatIndex;
      timeline.push(hand({
        id: `long-${handIndex}`,
        handIndex,
        dealerSeatIndex,
        outcome: 'discard',
        rules,
        fan: 3,
        winnerSeatIndex,
        discarderSeatIndex: dealerSeatIndex,
      }));
      dealerSeatIndex = winnerSeatIndex;
    }

    const result = replayGameRecord(record({ rules, timeline }));

    expect(result.isValid).toBe(true);
    expect(result.handProjections).toHaveLength(128);
    expect(result.players.map((player) => player.totalQ)).toEqual([0, 0, 0, 0]);
    expect(result.finalRound?.nextRoundLabelZh).toBe('東風東局');
  });
});
