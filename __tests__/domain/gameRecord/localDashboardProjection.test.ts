import { computeHkSettlement } from '../../../src/domain/hk/settlement';
import {
  buildLocalDashboardProjection,
} from '../../../src/domain/gameRecord/localDashboardProjection';
import { replayLocalGameBundle } from '../../../src/services/localGameReplay';
import { traditionalRules } from '../../../test-support/gameRecord/fixtures';
import type { GameBundle, Player } from '../../../src/models/db';

function players(gameId: string, seats = ['p0', 'p1', 'p2', 'p3']): Player[] {
  return seats.map((id, seatIndex) => ({ id, gameId, name: `Player ${id.slice(1)}`, seatIndex }));
}

function explicitEndedBundle(): GameBundle {
  const gameId = 'dashboard-explicit';
  const rules = traditionalRules({ gunMode: 'halfGun' });
  const deltasQ = computeHkSettlement({
    rules,
    fan: 3,
    settlementType: 'discard',
    winnerSeatIndex: 1,
    discarderSeatIndex: 0,
  }).deltasQ;
  return {
    game: {
      id: gameId,
      title: 'Canonical dashboard',
      createdAt: 1_700_000_000_000,
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: JSON.stringify(rules),
      startingDealerSeatIndex: 0,
      progressIndex: 0,
      currentWindIndex: 0,
      currentRoundNumber: 1,
      maxWindIndex: 1,
      seatRotationOffset: 0,
      seatBoundaryHistoryMode: 'explicit',
      initialSeatMappingJson: JSON.stringify({ 0: 'p0', 1: 'p1', 2: 'p2', 3: 'p3' }),
      gameState: 'ended',
      currentRoundLabelZh: '東風南局',
      endedAt: 1_700_000_001_000,
      handsCount: 1,
      resultStatus: 'result',
      resultSummaryJson: JSON.stringify({
        seatTotalsQ: deltasQ,
        playerTotalsQ: { p0: deltasQ[0], p1: deltasQ[1], p2: deltasQ[2], p3: deltasQ[3] },
        playersCount: 4,
      }),
      resultUpdatedAt: 1_700_000_001_000,
    },
    players: players(gameId),
    hands: [{
      id: 'h0', gameId, handIndex: 0, dealerSeatIndex: 0, windIndex: 0, roundNumber: 1,
      isDraw: false, winnerSeatIndex: 1, type: 'discard', winnerPlayerId: 'p1', discarderPlayerId: 'p0',
      inputValue: 0, deltasJson: JSON.stringify({ unit: 'Q', values: deltasQ }),
      nextRoundLabelZh: '東風南局', computedJson: JSON.stringify({ settlementType: 'discard', fan: 3 }),
      createdAt: 1_700_000_000_001,
    }],
    seatBoundaries: [],
  };
}

describe('local dashboard projection', () => {
  it('selects an immutable canonical projection only for an authoritative explicit ended replay', () => {
    const bundle = explicitEndedBundle();
    const before = JSON.parse(JSON.stringify(bundle)) as GameBundle;
    const replay = replayLocalGameBundle(bundle);
    expect(replay.authoritative).toBe(true);

    const result = buildLocalDashboardProjection({ bundle, localReplayResult: replay });

    expect(result).toMatchObject({ source: 'canonical', fallbackReason: null });
    expect(result.projection.players.map((player) => player.playerId)).toEqual(['p1', 'p2', 'p3', 'p0']);
    expect(result.projection.statistics).toMatchObject({ handsCount: 1, draws: 0, zeroSum: true });
    expect(result.projection.hands[0]).toMatchObject({
      id: 'h0', outcome: 'discard', winnerPlayerId: 'p1', discarderPlayerId: 'p0', fan: 3,
      roundLabelZh: '東風南局', nextRoundLabelZh: '東風南局',
    });
    expect(result.projection.settlementDirections).toEqual(replay.replay?.settlementDirections);
    expect(result.projection.ruleSummary).toMatchObject({ variant: 'HK', minFanToWin: 3, gunMode: 'halfGun' });
    expect(bundle).toEqual(before);
  });

  it('keeps a final persisted boundary at handCount out of prior hand attribution', () => {
    const bundle = explicitEndedBundle();
    bundle.players = players(bundle.game.id, ['p3', 'p0', 'p1', 'p2']);
    bundle.seatBoundaries = [{
      id: 'final-boundary', gameId: bundle.game.id, effectiveFromHandIndex: 1,
      seatMapping: { 0: 'p3', 1: 'p0', 2: 'p1', 3: 'p2' }, reason: 'confirmed_reseat', createdAt: 1_700_000_000_500,
    }];
    const replay = replayLocalGameBundle(bundle);
    expect(replay.authoritative).toBe(true);

    const projection = buildLocalDashboardProjection({ bundle, localReplayResult: replay }).projection;
    expect(projection.source).toBe('canonical');
    expect(projection.hands[0].winnerPlayerId).toBe('p1');
    expect(projection.players.find((player) => player.playerId === 'p1')?.totalQ).toBeGreaterThan(0);
    expect(projection.players.find((player) => player.playerId === 'p3')?.finalSeatIndex).toBe(0);
  });

  it('falls back without losing legacy presentation data when replay is not authoritative', () => {
    const bundle = explicitEndedBundle();
    bundle.hands[0].deltasJson = JSON.stringify([0, 0, 0, 0]);
    const replay = replayLocalGameBundle(bundle);
    expect(replay.authoritative).toBe(false);

    const result = buildLocalDashboardProjection({ bundle, localReplayResult: replay });
    expect(result.source).toBe('legacy');
    expect(result.fallbackReason).toBe('REPLAY_INVALID');
    expect(result.projection.hands).toHaveLength(1);
    expect(result.projection.players).toHaveLength(4);
  });

  it('uses a stable legacy fallback for an active game without attempting canonical projection', () => {
    const bundle = explicitEndedBundle();
    bundle.game.gameState = 'active';
    bundle.game.endedAt = null;
    bundle.game.resultSummaryJson = null;
    const result = buildLocalDashboardProjection({ bundle, localReplayResult: null });
    expect(result).toMatchObject({ source: 'legacy', fallbackReason: 'NOT_DASHBOARD_LIFECYCLE' });
    expect(result.projection.hands[0].windLabelZh).toBe('東風');
  });
});
