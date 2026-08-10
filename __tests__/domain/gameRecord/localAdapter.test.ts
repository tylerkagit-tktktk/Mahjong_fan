import { buildGameResultSummarySnapshot } from '../../../src/db/repo';
import {
  adaptLocalGameBundle,
  type LocalAdapterDiagnosticCode,
} from '../../../src/domain/gameRecord/localAdapter';
import { replayLocalGameBundle } from '../../../src/services/localGameReplay';
import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import { getRoundLabel } from '../../../src/models/dealer';
import type { GameBundle, Hand, Player } from '../../../src/models/db';
import type { RulesV1 } from '../../../src/models/rules';
import {
  EMPTY_GAME_BUNDLE,
  FIXED_CREATED_AT,
  GOLDEN_PLAYERS,
  customRules,
  traditionalRules,
} from '../../../test-support/gameRecord/fixtures';

type HandOutcome = 'zimo' | 'discard' | 'draw';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function playerIdAtSeat(seatIndex: number): string {
  return GOLDEN_PLAYERS.find((player) => player.seatIndex === seatIndex)?.id ?? '';
}

function makeHand(input: {
  id: string;
  handIndex: number;
  dealerSeatIndex: number;
  outcome: HandOutcome;
  rules?: RulesV1;
  fan?: number;
  winnerSeatIndex?: number;
  discarderSeatIndex?: number;
  dealerAction?: 'stick' | 'pass';
  persistedDeltasQ?: readonly number[] | null;
  nextRoundLabelZh?: string;
}): Hand {
  const rules = input.rules ?? traditionalRules();
  const winnerSeatIndex = input.outcome === 'draw' ? null : input.winnerSeatIndex ?? 0;
  const discarderSeatIndex = input.outcome === 'discard' ? input.discarderSeatIndex ?? 1 : null;
  const fan = input.outcome === 'draw' ? null : input.fan ?? 3;
  const deltasQ = input.outcome === 'draw'
    ? [0, 0, 0, 0]
    : computeHkSettlement({
        rules,
        fan: fan as number,
        settlementType: input.outcome,
        winnerSeatIndex: winnerSeatIndex!,
        discarderSeatIndex,
      }).deltasQ;
  const computed = input.outcome === 'draw'
    ? {
        settlementType: 'draw',
        dealerAction: input.dealerAction ?? 'stick',
      }
    : {
        settlementType: input.outcome,
        fan,
      };
  return {
    id: input.id,
    gameId: EMPTY_GAME_BUNDLE.game.id,
    handIndex: input.handIndex,
    dealerSeatIndex: input.dealerSeatIndex,
    windIndex: 0,
    roundNumber: 1,
    isDraw: input.outcome === 'draw',
    winnerSeatIndex,
    type: input.outcome === 'draw' ? 'draw' : 'fan',
    winnerPlayerId: winnerSeatIndex === null ? null : playerIdAtSeat(winnerSeatIndex),
    discarderPlayerId: discarderSeatIndex === null ? null : playerIdAtSeat(discarderSeatIndex),
    inputValue: 0,
    deltasJson: input.persistedDeltasQ === undefined
      ? JSON.stringify({ unit: 'Q', values: deltasQ })
      : input.persistedDeltasQ === null
        ? null
        : JSON.stringify(input.persistedDeltasQ),
    nextRoundLabelZh: input.nextRoundLabelZh ?? '',
    computedJson: JSON.stringify(computed),
    createdAt: FIXED_CREATED_AT + input.handIndex * 1_000,
  };
}

function makeBundle(input: {
  rules?: RulesV1;
  hands?: Hand[];
  gameState?: GameBundle['game']['gameState'];
  startingDealerSeatIndex?: number;
  players?: Player[];
  currentRoundLabelZh?: string | null;
  resultSummaryJson?: string | null;
  handsCount?: number;
  seatBoundaryHistoryMode?: 'legacy_inferred' | 'explicit';
  seatBoundaries?: GameBundle['seatBoundaries'];
} = {}): GameBundle {
  const rules = input.rules ?? traditionalRules();
  const hands = clone(input.hands ?? []);
  const startingDealerSeatIndex = input.startingDealerSeatIndex ?? 0;
  const normalizedHands = hands.map((hand, index) => ({
    ...hand,
    nextRoundLabelZh: hand.nextRoundLabelZh || getRoundLabel(startingDealerSeatIndex, hands.slice(0, index + 1)).labelZh,
  }));
  return {
    game: {
      ...clone(EMPTY_GAME_BUNDLE.game),
      rulesJson: JSON.stringify(rules),
      startingDealerSeatIndex,
      gameState: input.gameState ?? (hands.length > 0 ? 'active' : 'draft'),
      endedAt: input.gameState === 'ended' ? FIXED_CREATED_AT + 90_000 : null,
      handsCount: input.handsCount ?? normalizedHands.length,
      currentRoundLabelZh: input.currentRoundLabelZh === undefined
        ? getRoundLabel(startingDealerSeatIndex, normalizedHands).labelZh
        : input.currentRoundLabelZh,
      resultStatus: input.resultSummaryJson ? 'result' : 'none',
      resultSummaryJson: input.resultSummaryJson ?? null,
      seatBoundaryHistoryMode: input.seatBoundaryHistoryMode ?? 'explicit',
      initialSeatMappingJson: JSON.stringify({
        0: 'player-east',
        1: 'player-south',
        2: 'player-west',
        3: 'player-north',
      }),
    },
    players: clone(input.players ?? GOLDEN_PLAYERS),
    hands: normalizedHands,
    seatBoundaries: clone(input.seatBoundaries ?? []),
  };
}

function withFanInWinningRows(bundle: GameBundle, fan = 3): GameBundle {
  return {
    ...clone(bundle),
    hands: bundle.hands.map((hand) => {
      if (hand.isDraw) {
        return hand;
      }
      const computed = JSON.parse(hand.computedJson) as Record<string, unknown>;
      computed.fan = fan;
      return { ...hand, computedJson: JSON.stringify(computed) };
    }),
  };
}

function diagnosticCodes(result: ReturnType<typeof adaptLocalGameBundle>): LocalAdapterDiagnosticCode[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe('local GameBundle adapter', () => {
  it('adapts an empty active/draft game without adding timeline entries', () => {
    const result = adaptLocalGameBundle(makeBundle());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.timeline).toEqual([]);
      expect(result.snapshot.startingDealerSeatIndex).toBe(0);
      expect(result.snapshot.initialSeats).toHaveLength(4);
    }
  });

  it('retains the Local adapter invariant of exactly four permanent player rows', () => {
    const fifthPlayer: Player = {
      id: 'local-fifth', gameId: EMPTY_GAME_BUNDLE.game.id, name: 'Fifth', seatIndex: 0,
    };
    const result = adaptLocalGameBundle(makeBundle({ players: [...GOLDEN_PLAYERS, fifthPlayer] }));

    expect(result.ok).toBe(false);
    expect(diagnosticCodes(result)).toContain('INVALID_LOCAL_PLAYER');
  });

  it('preserves a non-East starting dealer and canonical zero-based hand index', () => {
    const result = adaptLocalGameBundle(makeBundle({ startingDealerSeatIndex: 2 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.startingDealerSeatIndex).toBe(2);
      expect(result.snapshot.timeline).toEqual([]);
    }
  });

  it.each([
    ['dealer zimo', traditionalRules(), makeHand({ id: 'zimo', handIndex: 0, dealerSeatIndex: 0, outcome: 'zimo', winnerSeatIndex: 0 })],
    ['half-gun discard', traditionalRules({ gunMode: 'halfGun' }), makeHand({ id: 'half', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', winnerSeatIndex: 0, discarderSeatIndex: 1 })],
    ['full-gun discard', traditionalRules({ gunMode: 'fullGun' }), makeHand({ id: 'full', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', winnerSeatIndex: 0, discarderSeatIndex: 1, rules: traditionalRules({ gunMode: 'fullGun' }) })],
    ['custom unit and cap', customRules({ unitPerFan: 0.5, capFan: 5 }), makeHand({ id: 'custom', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', winnerSeatIndex: 0, discarderSeatIndex: 1, fan: 7, rules: customRules({ unitPerFan: 0.5, capFan: 5 }) })],
  ])('$0 maps winning hand input and rules without applying a second payout path', (_name, rules, hand) => {
    const result = adaptLocalGameBundle(withFanInWinningRows(makeBundle({ rules, hands: [hand] })));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const canonicalHand = result.snapshot.timeline[0];
      expect(canonicalHand.entryType).toBe('hand');
      if (canonicalHand.entryType === 'hand') {
        expect(canonicalHand.handIndex).toBe(0);
        expect(canonicalHand.winnerPlayerId).toBe('player-east');
        expect(canonicalHand.persistedDeltasQ).toHaveLength(4);
      }
    }
  });

  it.each([
    ['draw stay', 'stick', '東風東局'],
    ['draw pass', 'pass', '東風南局'],
  ] as const)('$0 maps explicit draw $1 action', (_name, dealerAction, nextLabel) => {
    const hand = makeHand({
      id: `draw-${dealerAction}`,
      handIndex: 0,
      dealerSeatIndex: 0,
      outcome: 'draw',
      dealerAction,
      nextRoundLabelZh: nextLabel,
    });
    const result = adaptLocalGameBundle(makeBundle({ hands: [hand], currentRoundLabelZh: nextLabel }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      const canonicalHand = result.snapshot.timeline[0];
      expect(canonicalHand).toMatchObject({
        entryType: 'hand',
        outcome: 'draw',
        drawDealerAction: dealerAction,
        fan: null,
      });
    }
  });

  it('emits one explicit boundary after North-to-East and keeps final boundary at handCount', () => {
    const hands = Array.from({ length: 16 }, (_, handIndex) => {
      const dealerSeatIndex = handIndex % 4;
      return makeHand({
        id: `wrap-${handIndex}`,
        handIndex,
        dealerSeatIndex,
        outcome: 'discard',
        winnerSeatIndex: (dealerSeatIndex + 1) % 4,
        discarderSeatIndex: dealerSeatIndex,
      });
    }).map((hand, index, allHands) => ({
      ...hand,
      nextRoundLabelZh: getRoundLabel(0, allHands.slice(0, index + 1)).labelZh,
    }));
    const bundle = makeBundle({
      hands,
      currentRoundLabelZh: '東風東局',
      seatBoundaryHistoryMode: 'legacy_inferred',
    });
    const result = adaptLocalGameBundle(bundle);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const boundaries = result.snapshot.timeline.filter((entry) => entry.entryType === 'seat-boundary');
      expect(boundaries).toHaveLength(1);
      expect(boundaries[0]).toMatchObject({
        effectiveFromHandIndex: 16,
        id: `${bundle.game.id}:seat-boundary:16`,
      });
      const replayed = replayLocalGameBundle(bundle);
      expect(replayed.parity?.requiredStatus).toBe('exact');
      expect(replayed.authoritative).toBe(false);
    }
  });

  it('uses persisted explicit boundaries for identity totals and final-seat parity', () => {
    const first = makeHand({
      id: 'explicit-before',
      handIndex: 0,
      dealerSeatIndex: 0,
      outcome: 'discard',
      winnerSeatIndex: 1,
      discarderSeatIndex: 0,
    });
    const second = {
      ...makeHand({
        id: 'explicit-after',
        handIndex: 1,
        dealerSeatIndex: 1,
        outcome: 'discard',
        winnerSeatIndex: 0,
        discarderSeatIndex: 1,
      }),
      winnerPlayerId: 'player-north',
      discarderPlayerId: 'player-east',
    };
    const reseatedPlayers = [
      { id: 'player-north', gameId: EMPTY_GAME_BUNDLE.game.id, name: 'North', seatIndex: 0 },
      { id: 'player-east', gameId: EMPTY_GAME_BUNDLE.game.id, name: 'East', seatIndex: 1 },
      { id: 'player-south', gameId: EMPTY_GAME_BUNDLE.game.id, name: 'South', seatIndex: 2 },
      { id: 'player-west', gameId: EMPTY_GAME_BUNDLE.game.id, name: 'West', seatIndex: 3 },
    ];
    const bundle = makeBundle({
      hands: [first, second],
      players: reseatedPlayers,
      seatBoundaryHistoryMode: 'explicit',
      seatBoundaries: [{
        id: 'confirmed-boundary-1',
        gameId: EMPTY_GAME_BUNDLE.game.id,
        effectiveFromHandIndex: 1,
        seatMapping: {
          0: 'player-north',
          1: 'player-east',
          2: 'player-south',
          3: 'player-west',
        },
        reason: 'confirmed_reseat',
        createdAt: FIXED_CREATED_AT + 1_500,
      }],
    });

    const result = replayLocalGameBundle(bundle);
    expect(result.adapter?.ok).toBe(true);
    expect(result.replay?.isValid).toBe(true);
    expect(result.parity?.requiredStatus).toBe('exact');
    expect(result.authoritative).toBe(true);
    expect(result.replay?.players.find((player) => player.playerId === 'player-north')?.totalQ).toBe(24);
    expect(result.replay?.finalSeats).toEqual([
      { seatIndex: 0, playerId: 'player-north' },
      { seatIndex: 1, playerId: 'player-east' },
      { seatIndex: 2, playerId: 'player-south' },
      { seatIndex: 3, playerId: 'player-west' },
    ]);
  });

  it('accepts an explicit final boundary at handCount and never infers one from a wind wrap', () => {
    const finalBoundaryBundle = makeBundle({
      hands: [makeHand({ id: 'boundary-at-end', handIndex: 0, dealerSeatIndex: 0, outcome: 'draw' })],
      players: [
        { id: 'player-north', gameId: EMPTY_GAME_BUNDLE.game.id, name: 'North', seatIndex: 0 },
        { id: 'player-east', gameId: EMPTY_GAME_BUNDLE.game.id, name: 'East', seatIndex: 1 },
        { id: 'player-south', gameId: EMPTY_GAME_BUNDLE.game.id, name: 'South', seatIndex: 2 },
        { id: 'player-west', gameId: EMPTY_GAME_BUNDLE.game.id, name: 'West', seatIndex: 3 },
      ],
      seatBoundaries: [{
        id: 'boundary-at-end',
        gameId: EMPTY_GAME_BUNDLE.game.id,
        effectiveFromHandIndex: 1,
        seatMapping: { 0: 'player-north', 1: 'player-east', 2: 'player-south', 3: 'player-west' },
        reason: 'confirmed_reseat',
        createdAt: FIXED_CREATED_AT + 2_000,
      }],
    });
    expect(replayLocalGameBundle(finalBoundaryBundle).authoritative).toBe(true);

    const wrapHands = Array.from({ length: 16 }, (_, handIndex) => makeHand({
      id: `explicit-wrap-${handIndex}`,
      handIndex,
      dealerSeatIndex: handIndex % 4,
      outcome: 'discard',
      winnerSeatIndex: (handIndex + 1) % 4,
      discarderSeatIndex: handIndex % 4,
    })).map((hand, index, allHands) => ({
      ...hand,
      nextRoundLabelZh: getRoundLabel(0, allHands.slice(0, index + 1)).labelZh,
    }));
    const explicitWithoutBoundary = adaptLocalGameBundle(makeBundle({ hands: wrapHands }));
    expect(explicitWithoutBoundary.ok).toBe(true);
    if (explicitWithoutBoundary.ok) {
      expect(explicitWithoutBoundary.snapshot.timeline.filter((entry) => entry.entryType === 'seat-boundary')).toEqual([]);
    }
  });

  it('rejects malformed, duplicate, and incomplete explicit persisted boundaries without inference fallback', () => {
    const bundle = makeBundle({
      hands: [makeHand({ id: 'boundary-validation-hand', handIndex: 0, dealerSeatIndex: 0, outcome: 'draw' })],
      seatBoundaries: [
        {
          id: 'duplicate-a',
          gameId: EMPTY_GAME_BUNDLE.game.id,
          effectiveFromHandIndex: 0,
          seatMapping: { 0: 'player-east', 1: 'player-south', 2: 'player-west', 3: 'player-north' },
          reason: 'confirmed_reseat',
          createdAt: FIXED_CREATED_AT,
        },
        {
          id: 'duplicate-b',
          gameId: EMPTY_GAME_BUNDLE.game.id,
          effectiveFromHandIndex: 0,
          seatMapping: { 0: 'player-east', 1: 'player-south', 2: 'player-west', 3: 'player-north' },
          reason: 'confirmed_reseat',
          createdAt: FIXED_CREATED_AT + 1,
        },
        {
          id: 'incomplete-c',
          gameId: EMPTY_GAME_BUNDLE.game.id,
          effectiveFromHandIndex: 1,
          seatMapping: { 0: 'player-east', 1: 'player-south', 2: 'player-west' } as Record<number, string>,
          reason: 'confirmed_reseat',
          createdAt: FIXED_CREATED_AT + 2,
        },
      ],
    });
    bundle.game.initialSeatMappingJson = null;
    const result = adaptLocalGameBundle(bundle);
    expect(result.ok).toBe(false);
    expect(diagnosticCodes(result)).toContain('DUPLICATE_PERSISTED_SEAT_BOUNDARY');
    expect(diagnosticCodes(result)).toContain('INCOMPLETE_BOUNDARY_MAPPING');
    expect(diagnosticCodes(result)).toContain('MISSING_EXPLICIT_BOUNDARY_HISTORY');
  });

  it('adapts an abandoned zero-hand game without inventing a result summary', () => {
    const result = adaptLocalGameBundle(makeBundle({ gameState: 'abandoned' }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.lifecycle).toBe('abandoned');
      expect(result.snapshot.timeline).toEqual([]);
    }
  });

  it('reports malformed rules, unsupported TW/PMA, malformed hand JSON, and malformed deltas', () => {
    const malformedRules = makeBundle();
    malformedRules.game.rulesJson = '{not-json';
    expect(diagnosticCodes(adaptLocalGameBundle(malformedRules))).toContain('MALFORMED_RULES_JSON');

    ['TW', 'PMA'].forEach((variant) => {
      const unsupportedVariant = makeBundle();
      unsupportedVariant.game.variant = variant;
      expect(diagnosticCodes(adaptLocalGameBundle(unsupportedVariant))).toContain('UNSUPPORTED_LOCAL_RULE_VARIANT');
    });

    const missingRulesVariant = makeBundle();
    missingRulesVariant.game.rulesJson = JSON.stringify({ version: 1, hk: {} });
    expect(diagnosticCodes(adaptLocalGameBundle(missingRulesVariant))).toContain('CORRUPTED_RULES_SNAPSHOT');

    const malformedHand = makeHand({ id: 'bad-json', handIndex: 0, dealerSeatIndex: 0, outcome: 'draw' });
    malformedHand.computedJson = '{not-json';
    expect(diagnosticCodes(adaptLocalGameBundle(makeBundle({ hands: [malformedHand] })))).toContain('MALFORMED_HAND_INPUT_JSON');

    const malformedDeltaHand = makeHand({ id: 'bad-delta', handIndex: 0, dealerSeatIndex: 0, outcome: 'draw' });
    malformedDeltaHand.deltasJson = '{"values":[1,2]}';
    expect(diagnosticCodes(adaptLocalGameBundle(makeBundle({ hands: [malformedDeltaHand] })))).toContain('MALFORMED_DELTA_JSON');
  });

  it('reports missing identity, duplicate local seats/players, and persisted count mismatch', () => {
    const missingIdentityHand = makeHand({ id: 'missing-id', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard' });
    missingIdentityHand.winnerPlayerId = null;
    expect(diagnosticCodes(adaptLocalGameBundle(makeBundle({ hands: [missingIdentityHand] })))).toContain('MISSING_HAND_PLAYER_IDENTITY');

    const duplicateSeatPlayers = clone(GOLDEN_PLAYERS);
    duplicateSeatPlayers[1].seatIndex = duplicateSeatPlayers[0].seatIndex;
    expect(diagnosticCodes(adaptLocalGameBundle(makeBundle({ players: duplicateSeatPlayers })))).toContain('DUPLICATE_LOCAL_SEAT');

    const duplicateIdPlayers = clone(GOLDEN_PLAYERS);
    duplicateIdPlayers[1].id = duplicateIdPlayers[0].id;
    expect(diagnosticCodes(adaptLocalGameBundle(makeBundle({ players: duplicateIdPlayers })))).toContain('DUPLICATE_LOCAL_PLAYER');

    const countMismatch = adaptLocalGameBundle(makeBundle({ handsCount: 2 }));
    expect(countMismatch.ok).toBe(true);
    expect(diagnosticCodes(countMismatch)).toContain('PERSISTED_HANDS_COUNT_MISMATCH');
  });

  it('does not guess a reseat when stored winner identity conflicts with inferred history', () => {
    const reseatedPlayers = clone(GOLDEN_PLAYERS);
    reseatedPlayers[0].seatIndex = 1;
    reseatedPlayers[1].seatIndex = 0;
    const hand = makeHand({
      id: 'before-reseat',
      handIndex: 0,
      dealerSeatIndex: 0,
      outcome: 'discard',
      winnerSeatIndex: 1,
      discarderSeatIndex: 0,
    });
    const result = adaptLocalGameBundle(makeBundle({
      players: reseatedPlayers,
      hands: [hand],
      seatBoundaryHistoryMode: 'legacy_inferred',
    }));

    expect(result.ok).toBe(false);
    expect(diagnosticCodes(result)).toContain('AMBIGUOUS_SEAT_ROTATION_HISTORY');
  });

  it('keeps adapter input immutable and deterministic', () => {
    const hands = [makeHand({ id: 'h0', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', winnerSeatIndex: 1, discarderSeatIndex: 0 })];
    const bundle = makeBundle({ hands });
    const before = clone(bundle);
    const first = adaptLocalGameBundle(bundle);
    const second = adaptLocalGameBundle(bundle);

    expect(bundle).toEqual(before);
    expect(first).toEqual(second);
  });

  it('produces required parity against computeGameStats and the existing result summary projection', () => {
    const hands = [
      makeHand({ id: 'parity-discard', handIndex: 0, dealerSeatIndex: 0, outcome: 'discard', winnerSeatIndex: 1, discarderSeatIndex: 0 }),
      makeHand({ id: 'parity-zimo', handIndex: 1, dealerSeatIndex: 1, outcome: 'zimo', winnerSeatIndex: 1 }),
    ];
    let bundle = makeBundle({
      hands,
      gameState: 'ended',
      currentRoundLabelZh: '東風南局',
    });
    bundle = {
      ...bundle,
      game: {
        ...bundle.game,
        resultStatus: 'result',
        resultSummaryJson: JSON.stringify(buildGameResultSummarySnapshot(bundle)),
      },
    };

    const result = replayLocalGameBundle(bundle);

    expect(result.authoritative).toBe(true);
    expect(result.replay?.isValid).toBe(true);
    expect(result.parity?.requiredStatus).toBe('exact');
    expect(result.parity?.items.some((item) => item.field === 'endedResultSummary.source')).toBe(true);
  });

  it('keeps legacy stored settlement mismatch visible in replay and parity', () => {
    const hand = makeHand({
      id: 'legacy-mismatch',
      handIndex: 0,
      dealerSeatIndex: 0,
      outcome: 'discard',
      winnerSeatIndex: 1,
      discarderSeatIndex: 0,
      persistedDeltasQ: [16, -16, 0, 0],
    });
    const result = replayLocalGameBundle(makeBundle({ hands: [hand] }));

    expect(result.replay?.isValid).toBe(false);
    expect(result.replay?.validationIssues.map((issue) => issue.code)).toContain('STORED_SETTLEMENT_MISMATCH');
    expect(result.parity?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'persistedDeltaQ', status: 'mismatch', handIndex: 0 }),
    ]));
    expect(result.authoritative).toBe(false);
  });

  it('reports persisted current label mismatch without rewriting the source bundle', () => {
    const hand = makeHand({
      id: 'label-mismatch',
      handIndex: 0,
      dealerSeatIndex: 0,
      outcome: 'draw',
      dealerAction: 'pass',
      nextRoundLabelZh: '東風南局',
    });
    const bundle = makeBundle({ hands: [hand], currentRoundLabelZh: '東風東局' });
    const before = clone(bundle);
    const result = replayLocalGameBundle(bundle);

    expect(result.adapter?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PERSISTED_CURRENT_ROUND_LABEL_MISMATCH', severity: 'warning' }),
    ]));
    expect(result.authoritative).toBe(false);
    expect(bundle).toEqual(before);
  });

  it('marks a stale persisted ended result summary as non-authoritative', () => {
    const hand = makeHand({
      id: 'summary-source',
      handIndex: 0,
      dealerSeatIndex: 0,
      outcome: 'discard',
      winnerSeatIndex: 1,
      discarderSeatIndex: 0,
    });
    const base = makeBundle({ hands: [hand], gameState: 'ended', currentRoundLabelZh: '東風南局' });
    const summary = buildGameResultSummarySnapshot(base);
    summary.playerTotalsQ['player-south'] += 4;
    const bundle: GameBundle = {
      ...base,
      game: {
        ...base.game,
        resultStatus: 'result',
        resultSummaryJson: JSON.stringify(summary),
      },
    };

    const result = replayLocalGameBundle(bundle);

    expect(result.adapter?.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PERSISTED_RESULT_SUMMARY_MISMATCH', severity: 'warning' }),
    ]));
    expect(result.authoritative).toBe(false);
  });
});
