import { adaptCloudSourceToCanonical } from '../../../src/domain/gameRecord/cloudAdapter';
import { parseCloudArchiveSource } from '../../../src/domain/gameRecord/cloudSource';
import type { CanonicalHandInput, CanonicalSeatBoundary } from '../../../src/domain/gameRecord/types';
import {
  CLOUD_PLAYER_IDS,
  cloudHand,
  cloudLineup,
  cloudMember,
  cloudTemporaryPlayer,
  createCloudArchiveFixture,
} from '../../../test-support/gameRecord/cloudFixtures';

function parseAndAdapt(input: unknown) {
  const parsed = parseCloudArchiveSource(input);
  if (!parsed.ok) throw new Error(`Source unexpectedly invalid: ${JSON.stringify(parsed.diagnostics)}`);
  return adaptCloudSourceToCanonical(parsed.source);
}

function membersWithFifth() {
  return [
    cloudMember(CLOUD_PLAYER_IDS.east, 'East'),
    cloudMember(CLOUD_PLAYER_IDS.south, 'South'),
    cloudMember(CLOUD_PLAYER_IDS.west, 'West'),
    cloudMember(CLOUD_PLAYER_IDS.north, 'North'),
    cloudMember(CLOUD_PLAYER_IDS.fifth, 'Fifth'),
  ];
}

describe('Cloud canonical adapter', () => {
  it('maps the initial lineup to canonical seats without an unnecessary boundary', () => {
    const result = parseAndAdapt(createCloudArchiveFixture());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid adapter');
    expect(result.value.snapshot.initialSeats.map((seat) => seat.playerId)).toEqual([
      CLOUD_PLAYER_IDS.east, CLOUD_PLAYER_IDS.south, CLOUD_PLAYER_IDS.west, CLOUD_PLAYER_IDS.north,
    ]);
    expect(result.value.snapshot.timeline).toEqual([]);
  });

  it('normalizes source hand 1 to canonical 0 and retains separate traceability', () => {
    const result = parseAndAdapt(createCloudArchiveFixture({ hands: [cloudHand({
      handIndex: 1,
      handId: 'cloud-stable-id',
      type: 'draw',
    })] }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid adapter');
    const canonicalHand = result.value.snapshot.timeline[0] as CanonicalHandInput;
    expect(canonicalHand.handIndex).toBe(0);
    expect(canonicalHand.id).toBe('cloud-hand:cloud-stable-id');
    expect(canonicalHand.dealerSeatIndex).toBeNull();
    expect(canonicalHand.persistedDeltasQ).toBeNull();
    expect(result.value.handTrace).toEqual([{
      sourceHandId: 'cloud-stable-id',
      sourceHandIndex: 1,
      canonicalHandIndex: 0,
      canonicalHandId: 'cloud-hand:cloud-stable-id',
    }]);
  });

  it('maps a later lineup to a boundary before its normalized hand', () => {
    const swappedSeats = {
      '0': CLOUD_PLAYER_IDS.south,
      '1': CLOUD_PLAYER_IDS.east,
      '2': CLOUD_PLAYER_IDS.west,
      '3': CLOUD_PLAYER_IDS.north,
    };
    const result = parseAndAdapt(createCloudArchiveFixture({
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2, seats: swappedSeats }),
      ],
      hands: [
        cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 1 }),
        cloudHand({ handIndex: 2, type: 'draw', lineupVersion: 2 }),
      ],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid adapter');
    expect(result.value.snapshot.timeline.map((entry) => [entry.entryType, entry.entryType === 'hand' ? entry.handIndex : entry.effectiveFromHandIndex])).toEqual([
      ['hand', 0], ['seat-boundary', 1], ['hand', 1],
    ]);
    const boundary = result.value.snapshot.timeline[1] as CanonicalSeatBoundary;
    expect(boundary.seats.map((seat) => seat.playerId)).toEqual([
      CLOUD_PLAYER_IDS.south, CLOUD_PLAYER_IDS.east, CLOUD_PLAYER_IDS.west, CLOUD_PLAYER_IDS.north,
    ]);
  });

  it('supports member-to-temp and temp-to-member replacements without collapsing identity', () => {
    const tempSeats = {
      '0': CLOUD_PLAYER_IDS.east, '1': CLOUD_PLAYER_IDS.south,
      '2': CLOUD_PLAYER_IDS.west, '3': CLOUD_PLAYER_IDS.temp,
    };
    const memberSeats = {
      '0': CLOUD_PLAYER_IDS.east, '1': CLOUD_PLAYER_IDS.fifth,
      '2': CLOUD_PLAYER_IDS.west, '3': CLOUD_PLAYER_IDS.temp,
    };
    const result = parseAndAdapt(createCloudArchiveFixture({
      members: membersWithFifth(),
      tempPlayers: [cloudTemporaryPlayer()],
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2, seats: tempSeats }),
        cloudLineup({ lineupVersion: 3, effectiveFromHandIndex: 3, seats: memberSeats }),
      ],
      hands: [
        cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 1 }),
        cloudHand({ handIndex: 2, type: 'draw', lineupVersion: 2 }),
        cloudHand({ handIndex: 3, type: 'draw', lineupVersion: 3 }),
      ],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid adapter');
    expect(result.value.snapshot.players.map((player) => player.id)).toEqual(expect.arrayContaining([
      CLOUD_PLAYER_IDS.north, CLOUD_PLAYER_IDS.temp, CLOUD_PLAYER_IDS.fifth,
    ]));
    expect(result.value.snapshot.players).toHaveLength(6);
    expect(result.value.resultParticipantIds).toHaveLength(6);
  });

  it('preserves a pending final boundary while excluding its never-played identity from result participants', () => {
    const pendingSeats = {
      '0': CLOUD_PLAYER_IDS.east, '1': CLOUD_PLAYER_IDS.south,
      '2': CLOUD_PLAYER_IDS.west, '3': CLOUD_PLAYER_IDS.fifth,
    };
    const result = parseAndAdapt(createCloudArchiveFixture({
      members: membersWithFifth(),
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2, seats: pendingSeats }),
      ],
      hands: [cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 1 })],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid adapter');
    const pending = result.value.snapshot.timeline[1] as CanonicalSeatBoundary;
    expect(pending.effectiveFromHandIndex).toBe(1);
    expect(pending.seats[3].playerId).toBe(CLOUD_PLAYER_IDS.fifth);
    expect(result.value.resultParticipantIds).not.toContain(CLOUD_PLAYER_IDS.fifth);
    expect(result.value.snapshot.players.map((player) => player.id)).toContain(CLOUD_PLAYER_IDS.fifth);
  });

  it('uses the starting lineup as zero-hand result participants', () => {
    const result = parseAndAdapt(createCloudArchiveFixture());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid adapter');
    expect(result.value.resultParticipantIds).toEqual([
      CLOUD_PLAYER_IDS.east, CLOUD_PLAYER_IDS.south, CLOUD_PLAYER_IDS.west, CLOUD_PLAYER_IDS.north,
    ]);
  });

  it('uses the latest lineup effective for Cloud hand 1 as zero-hand participants', () => {
    const replacementSeats = {
      '0': CLOUD_PLAYER_IDS.east, '1': CLOUD_PLAYER_IDS.south,
      '2': CLOUD_PLAYER_IDS.west, '3': CLOUD_PLAYER_IDS.fifth,
    };
    const result = parseAndAdapt(createCloudArchiveFixture({
      members: membersWithFifth(),
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 1, seats: replacementSeats }),
      ],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid adapter');
    expect(result.value.resultParticipantIds).toEqual([
      CLOUD_PLAYER_IDS.east, CLOUD_PLAYER_IDS.south, CLOUD_PLAYER_IDS.west, CLOUD_PLAYER_IDS.fifth,
    ]);
  });

  it('requires the exact hand lineup version and never falls back', () => {
    const missing = parseAndAdapt(createCloudArchiveFixture({
      hands: [cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 2 })],
    }));
    expect(missing.ok).toBe(false);
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toContain('MISSING_CLOUD_LINEUP_VERSION');

    const early = parseAndAdapt(createCloudArchiveFixture({
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2 }),
      ],
      hands: [cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 2 })],
    }));
    expect(early.ok).toBe(false);
    expect(early.diagnostics.map((diagnostic) => diagnostic.code)).toContain('HAND_LINEUP_BOUNDARY_MISMATCH');
  });

  it('rejects a hand identity that is known globally but absent from its exact lineup', () => {
    const result = parseAndAdapt(createCloudArchiveFixture({
      members: membersWithFifth(),
      hands: [cloudHand({ handIndex: 1, type: 'zimo', winnerPlayerId: CLOUD_PLAYER_IDS.fifth })],
    }));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('UNKNOWN_CLOUD_PLAYER_IDENTITY');
  });

  it('rejects missing initial, active, and intermediate lineup contracts', () => {
    const missingInitial = parseAndAdapt(createCloudArchiveFixture({
      lineups: [cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 1 })],
    }));
    expect(missingInitial.ok).toBe(false);
    expect(missingInitial.diagnostics.map((diagnostic) => diagnostic.code)).toContain('MISSING_INITIAL_CLOUD_LINEUP');

    const missingIntermediate = parseAndAdapt(createCloudArchiveFixture({
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 3, effectiveFromHandIndex: 1 }),
      ],
    }));
    expect(missingIntermediate.ok).toBe(false);
    expect(missingIntermediate.diagnostics.map((diagnostic) => diagnostic.code)).toContain('MISSING_CLOUD_LINEUP_VERSION');

    const wrongActive = createCloudArchiveFixture();
    wrongActive.room.activeLineupVersion = 2;
    const missingActive = parseAndAdapt(wrongActive);
    expect(missingActive.ok).toBe(false);
    expect(missingActive.diagnostics.map((diagnostic) => diagnostic.code)).toContain('MISSING_ACTIVE_CLOUD_LINEUP');
  });

  it('accepts the latest of multiple same-future-index lineups and emits only its effective mapping', () => {
    const intermediateSeats = {
      '0': CLOUD_PLAYER_IDS.east, '1': CLOUD_PLAYER_IDS.south,
      '2': CLOUD_PLAYER_IDS.north, '3': CLOUD_PLAYER_IDS.west,
    };
    const finalSeats = {
      '0': CLOUD_PLAYER_IDS.south, '1': CLOUD_PLAYER_IDS.east,
      '2': CLOUD_PLAYER_IDS.west, '3': CLOUD_PLAYER_IDS.north,
    };
    const result = parseAndAdapt(createCloudArchiveFixture({
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2, seats: intermediateSeats }),
        cloudLineup({ lineupVersion: 3, effectiveFromHandIndex: 2, seats: finalSeats }),
      ],
      hands: [
        cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 1 }),
        cloudHand({ handIndex: 2, type: 'draw', lineupVersion: 3 }),
      ],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid adapter');
    const boundaries = result.value.snapshot.timeline.filter((entry): entry is CanonicalSeatBoundary => entry.entryType === 'seat-boundary');
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].id).toBe('cloud-lineup:lineup_3');
  });

  it('exposes the implicit seat-zero dealer rule as informational metadata', () => {
    const result = parseAndAdapt(createCloudArchiveFixture());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid adapter');
    expect(result.value.snapshot.startingDealerSeatIndex).toBe(0);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'IMPLICIT_STARTING_DEALER_SEAT_ZERO', severity: 'info',
    }));
  });
});
