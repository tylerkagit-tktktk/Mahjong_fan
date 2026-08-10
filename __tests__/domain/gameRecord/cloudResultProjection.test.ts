import { buildCloudCanonicalResult } from '../../../src/domain/gameRecord/cloudResultProjection';
import { customRules, traditionalRules } from '../../../test-support/gameRecord/fixtures';
import {
  CLOUD_PLAYER_IDS,
  cloneCloudFixture,
  cloudHand,
  cloudLineup,
  cloudMember,
  createCloudArchiveFixture,
} from '../../../test-support/gameRecord/cloudFixtures';

function requireProjection(input: unknown) {
  const result = buildCloudCanonicalResult(input);
  if (!result.canonicalValid || !result.projection || !result.replay) {
    throw new Error(`Expected valid Cloud result: ${JSON.stringify(result.diagnostics)}`);
  }
  return { result, projection: result.projection, replay: result.replay };
}

function fiveMembers() {
  return [
    cloudMember(CLOUD_PLAYER_IDS.east, 'East'),
    cloudMember(CLOUD_PLAYER_IDS.south, 'South'),
    cloudMember(CLOUD_PLAYER_IDS.west, 'West'),
    cloudMember(CLOUD_PLAYER_IDS.north, 'North'),
    cloudMember(CLOUD_PLAYER_IDS.fifth, 'Fifth'),
  ];
}

describe('pure Cloud canonical result characterization', () => {
  it('projects a zero-hand game as an all-zero competition tie with no stat leaders', () => {
    const { result, projection } = requireProjection(createCloudArchiveFixture());

    expect(result.sourceStatus).toBe('valid');
    expect(result.adapterStatus).toBe('valid');
    expect(result.replayStatus).toBe('valid');
    expect(result.projectionStatus).toBe('valid');
    expect(result.sourceTrust).toBe('legacy_unverified');
    expect(projection.ranking.map((player) => player.rank)).toEqual([1, 1, 1, 1]);
    expect(projection.ranking.map((player) => player.totalQ)).toEqual([0, 0, 0, 0]);
    expect(projection.statistics).toMatchObject({ handsCount: 0, draws: 0, zimoLeaders: null, discardLeaders: null });
    expect(projection.finalRound.nextRoundLabelZh).toBe('東風東局');
  });

  it('derives one zimo settlement, total, winner stat, and dealer stay through replay', () => {
    const { projection, replay } = requireProjection(createCloudArchiveFixture({
      hands: [cloudHand({ handIndex: 1, type: 'zimo', winnerPlayerId: CLOUD_PLAYER_IDS.east })],
    }));

    expect(replay.handProjections[0].deltasQ).toEqual([48, -16, -16, -16]);
    expect(projection.players.find((player) => player.playerId === CLOUD_PLAYER_IDS.east)).toMatchObject({
      totalQ: 48, wins: 1, zimoCount: 1,
    });
    expect(projection.statistics.zimoLeaders).toEqual({ count: 1, playerIds: [CLOUD_PLAYER_IDS.east] });
    expect(projection.finalRound.nextRoundLabelZh).toBe('東風東局');
  });

  it('derives one half-gun discard settlement and dealer advance through replay', () => {
    const { projection } = requireProjection(createCloudArchiveFixture({
      hands: [cloudHand({
        handIndex: 1,
        type: 'discard',
        winnerPlayerId: CLOUD_PLAYER_IDS.south,
        discarderPlayerId: CLOUD_PLAYER_IDS.east,
      })],
    }));

    expect(projection.hands[0].deltasQ).toEqual([-16, 32, -8, -8]);
    expect(projection.statistics.discardLeaders).toEqual({ count: 1, playerIds: [CLOUD_PLAYER_IDS.east] });
    expect(projection.finalRound.nextRoundLabelZh).toBe('東風南局');
  });

  it.each([
    ['stay', 'stick' as const, '東風東局'],
    ['pass', 'pass' as const, '東風南局'],
  ])('characterizes draw %s with zero settlement and explicit next state', (_label, dealerAction, nextLabel) => {
    const { projection } = requireProjection(createCloudArchiveFixture({
      hands: [cloudHand({ handIndex: 1, type: 'draw', dealerAction })],
    }));

    expect(projection.hands[0].deltasQ).toEqual([0, 0, 0, 0]);
    expect(projection.hands[0].currentRound.labelZh).toBe('東風東局');
    expect(projection.finalRound.nextRoundLabelZh).toBe(nextLabel);
    expect(projection.statistics.draws).toBe(1);
  });

  it('distinguishes every current-hand round from the final next-hand South-East state', () => {
    const { projection } = requireProjection(createCloudArchiveFixture({
      hands: [
        cloudHand({ handIndex: 1, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.south, discarderPlayerId: CLOUD_PLAYER_IDS.east }),
        cloudHand({ handIndex: 2, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.west, discarderPlayerId: CLOUD_PLAYER_IDS.south }),
        cloudHand({ handIndex: 3, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.north, discarderPlayerId: CLOUD_PLAYER_IDS.west }),
        cloudHand({ handIndex: 4, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.east, discarderPlayerId: CLOUD_PLAYER_IDS.north }),
      ],
    }));

    expect(projection.hands.map((hand) => hand.currentRound.labelZh)).toEqual([
      '東風東局', '東風南局', '東風西局', '東風北局',
    ]);
    expect(projection.hands[3].roundAfterHand?.nextRoundLabelZh).toBe('南風東局');
    expect(projection.finalRound.nextRoundLabelZh).toBe('南風東局');
  });

  it('replays a long Cloud timeline without recursion or source dealer snapshots', () => {
    const hands = Array.from({ length: 128 }, (_, index) => cloudHand({
      handIndex: index + 1,
      type: 'draw',
      dealerAction: 'pass',
    }));
    const { projection, replay } = requireProjection(createCloudArchiveFixture({ hands }));
    expect(projection.hands).toHaveLength(128);
    expect(projection.players.map((player) => player.totalQ)).toEqual([0, 0, 0, 0]);
    expect(replay.validationIssues).toEqual([]);
  });

  it('uses competition ranks 1,1,3,4 for tied leaders without preserving the Cloud UI bug', () => {
    const { projection } = requireProjection(createCloudArchiveFixture({
      rules: traditionalRules({ gunMode: 'fullGun' }),
      hands: [
        cloudHand({ handIndex: 1, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.east, discarderPlayerId: CLOUD_PLAYER_IDS.west }),
        cloudHand({ handIndex: 2, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.south, discarderPlayerId: CLOUD_PLAYER_IDS.north }),
        cloudHand({ handIndex: 3, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.west, discarderPlayerId: CLOUD_PLAYER_IDS.north }),
      ],
    }));
    expect(projection.ranking.map((player) => [player.totalQ, player.rank])).toEqual([
      [32, 1], [32, 1], [0, 3], [-64, 4],
    ]);
  });

  it('retains every tied zimo and discard leader and returns none for zero categories', () => {
    const zimo = requireProjection(createCloudArchiveFixture({ hands: [
      cloudHand({ handIndex: 1, type: 'zimo', winnerPlayerId: CLOUD_PLAYER_IDS.east }),
      cloudHand({ handIndex: 2, type: 'zimo', winnerPlayerId: CLOUD_PLAYER_IDS.south }),
    ] })).projection;
    expect(zimo.statistics.zimoLeaders).toEqual({
      count: 1, playerIds: [CLOUD_PLAYER_IDS.east, CLOUD_PLAYER_IDS.south],
    });
    expect(zimo.statistics.discardLeaders).toBeNull();

    const discard = requireProjection(createCloudArchiveFixture({ hands: [
      cloudHand({ handIndex: 1, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.east, discarderPlayerId: CLOUD_PLAYER_IDS.west }),
      cloudHand({ handIndex: 2, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.south, discarderPlayerId: CLOUD_PLAYER_IDS.north }),
    ] })).projection;
    expect(discard.statistics.discardLeaders).toEqual({
      count: 1, playerIds: [CLOUD_PLAYER_IDS.west, CLOUD_PLAYER_IDS.north],
    });
    expect(discard.statistics.zimoLeaders).toBeNull();
  });

  it('supports more than four historical participants while each hand retains four effective seats', () => {
    const replacementSeats = {
      '0': CLOUD_PLAYER_IDS.east, '1': CLOUD_PLAYER_IDS.south,
      '2': CLOUD_PLAYER_IDS.west, '3': CLOUD_PLAYER_IDS.fifth,
    };
    const { projection, replay } = requireProjection(createCloudArchiveFixture({
      members: fiveMembers(),
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2, seats: replacementSeats }),
      ],
      hands: [
        cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 1 }),
        cloudHand({ handIndex: 2, type: 'draw', lineupVersion: 2 }),
      ],
    }));
    expect(projection.players).toHaveLength(5);
    expect(projection.resultParticipantIds).toHaveLength(5);
    expect(replay.handProjections.every((hand) => hand.effectiveSeats.length === 4)).toBe(true);
  });

  it('keeps pending final seats but excludes a never-played replacement from ranking and stats', () => {
    const pendingSeats = {
      '0': CLOUD_PLAYER_IDS.east, '1': CLOUD_PLAYER_IDS.south,
      '2': CLOUD_PLAYER_IDS.west, '3': CLOUD_PLAYER_IDS.fifth,
    };
    const { projection } = requireProjection(createCloudArchiveFixture({
      members: fiveMembers(),
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2, seats: pendingSeats }),
      ],
      hands: [cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 1 })],
    }));
    expect(projection.finalSeats[3].playerId).toBe(CLOUD_PLAYER_IDS.fifth);
    expect(projection.ranking.map((player) => player.playerId)).not.toContain(CLOUD_PLAYER_IDS.fifth);
    expect(projection.players).toHaveLength(4);
  });

  it('matches the existing custom HK settlement golden behavior', () => {
    const { projection } = requireProjection(createCloudArchiveFixture({
      rules: customRules({ unitPerFan: 0.5, capFan: 5 }),
      hands: [cloudHand({
        handIndex: 1,
        type: 'discard',
        winnerPlayerId: CLOUD_PLAYER_IDS.east,
        discarderPlayerId: CLOUD_PLAYER_IDS.south,
        fan: 7,
      })],
    }));
    expect(projection.hands[0].deltasQ).toEqual([20, -20, 0, 0]);
    expect(projection.players.reduce((sum, player) => sum + player.totalQ, 0)).toBe(0);
  });

  it('separates source, adapter, and replay failures without plausible partial projections', () => {
    const malformed = buildCloudCanonicalResult(null);
    expect(malformed).toMatchObject({
      sourceStatus: 'invalid', adapterStatus: 'not_run', replayStatus: 'not_run', canonicalValid: false, projection: null,
    });

    const boundaryMismatch = buildCloudCanonicalResult(createCloudArchiveFixture({
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2 }),
      ],
      hands: [cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 2 })],
    }));
    expect(boundaryMismatch).toMatchObject({
      sourceStatus: 'valid', adapterStatus: 'invalid', replayStatus: 'not_run', canonicalValid: false, projection: null,
    });

    const belowMinimum = buildCloudCanonicalResult(createCloudArchiveFixture({
      hands: [cloudHand({ handIndex: 1, type: 'zimo', fan: 2 })],
    }));
    expect(belowMinimum).toMatchObject({
      sourceStatus: 'valid', adapterStatus: 'valid', replayStatus: 'invalid', canonicalValid: false, projection: null,
    });
    expect(belowMinimum.diagnostics.replay.map((diagnostic) => diagnostic.code)).toContain('BELOW_MINIMUM_FAN');
  });

  it('is deterministic, does not mutate source, and does not consult the clock', () => {
    const fixture = createCloudArchiveFixture({ hands: [cloudHand({ handIndex: 1, type: 'draw' })] });
    const before = cloneCloudFixture(fixture);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1);
    const first = buildCloudCanonicalResult(fixture);
    nowSpy.mockReturnValue(999_999);
    const second = buildCloudCanonicalResult(fixture);

    expect(first).toEqual(second);
    expect(fixture).toEqual(before);
    expect(nowSpy).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });
});
