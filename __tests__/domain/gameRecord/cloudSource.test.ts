import { parseCloudArchiveSource } from '../../../src/domain/gameRecord/cloudSource';
import { customRules, traditionalRules } from '../../../test-support/gameRecord/fixtures';
import {
  CLOUD_PLAYER_IDS,
  cloneCloudFixture,
  cloudHand,
  cloudLineup,
  cloudMember,
  cloudRulesSnapshot,
  cloudTemporaryPlayer,
  createCloudArchiveFixture,
} from '../../../test-support/gameRecord/cloudFixtures';

function codes(input: unknown): string[] {
  return parseCloudArchiveSource(input).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('strict legacy Cloud archive source parser', () => {
  it('recognizes a zero-hand archived source without consulting timestamps', () => {
    const fixture = createCloudArchiveFixture();
    const fixtureWithoutTimestamps = {
      ...fixture,
      archivedFromCloudAt: undefined,
      room: { ...fixture.room, createdAt: undefined, updatedAt: undefined },
    };

    const result = parseCloudArchiveSource(fixtureWithoutTimestamps);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid source');
    expect(result.source.format).toBe('legacy_unversioned_cloud_archive_v0');
    expect(result.source.sourceTrust).toBe('legacy_unverified');
    expect(result.source.hands).toEqual([]);
  });

  it('accepts both ended and archived lifecycle snapshots used by the archive flow', () => {
    expect(parseCloudArchiveSource(createCloudArchiveFixture({ roomOverrides: { status: 'ended' } })).ok).toBe(true);
    expect(parseCloudArchiveSource(createCloudArchiveFixture({ roomOverrides: { status: 'archived' } })).ok).toBe(true);
  });

  it.each([
    ['zimo', cloudHand({ handIndex: 1, type: 'zimo', winnerPlayerId: CLOUD_PLAYER_IDS.east })],
    ['discard', cloudHand({ handIndex: 1, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.east, discarderPlayerId: CLOUD_PLAYER_IDS.south })],
    ['draw stay', cloudHand({ handIndex: 1, type: 'draw', dealerAction: 'stick' })],
    ['draw pass', cloudHand({ handIndex: 1, type: 'draw', dealerAction: 'pass' })],
  ])('strictly parses a valid %s hand', (_label, hand) => {
    const result = parseCloudArchiveSource(createCloudArchiveFixture({ hands: [hand] }));
    expect(result.ok).toBe(true);
  });

  it('accepts contiguous one-based indexes and retains source hand IDs', () => {
    const fixture = createCloudArchiveFixture({
      hands: [1, 2, 3].map((handIndex) => cloudHand({ handIndex, type: 'draw', handId: `stable-${handIndex}` })),
    });

    const result = parseCloudArchiveSource(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid source');
    expect(result.source.hands.map((hand) => [hand.sourceHandId, hand.sourceHandIndex])).toEqual([
      ['stable-1', 1], ['stable-2', 2], ['stable-3', 3],
    ]);
  });

  it('rejects a zero, duplicate, gap, and duplicate source hand ID deterministically', () => {
    const zero = createCloudArchiveFixture({ hands: [cloudHand({ handIndex: 0, type: 'draw' })] });
    expect(codes(zero)).toContain('INVALID_CLOUD_HAND_INDEX');

    const duplicate = createCloudArchiveFixture({ hands: [
      cloudHand({ handIndex: 1, type: 'draw', handId: 'one' }),
      cloudHand({ handIndex: 1, type: 'draw', handId: 'other' }),
    ] });
    expect(codes(duplicate)).toContain('DUPLICATE_CLOUD_HAND_INDEX');

    const gap = createCloudArchiveFixture({ hands: [
      cloudHand({ handIndex: 1, type: 'draw' }),
      cloudHand({ handIndex: 2, type: 'draw' }),
      cloudHand({ handIndex: 4, type: 'draw' }),
    ] });
    expect(codes(gap)).toContain('NON_CONTIGUOUS_CLOUD_HAND_INDEX');

    const duplicateId = createCloudArchiveFixture({ hands: [
      cloudHand({ handIndex: 1, type: 'draw', handId: 'same' }),
      cloudHand({ handIndex: 2, type: 'draw', handId: 'same' }),
    ] });
    expect(codes(duplicateId)).toContain('DUPLICATE_CLOUD_HAND_ID');
  });

  it('rejects room hand-count mismatch instead of accepting a plausible partial timeline', () => {
    const fixture = createCloudArchiveFixture({
      hands: [cloudHand({ handIndex: 1, type: 'draw' })],
      roomOverrides: { currentHandIndex: 2 },
    });
    expect(codes(fixture)).toContain('CLOUD_CURRENT_HAND_INDEX_MISMATCH');
  });

  it('keeps duplicate display names as distinct stable member identities', () => {
    const fixture = createCloudArchiveFixture({ members: [
      cloudMember(CLOUD_PLAYER_IDS.east, 'Tyler'),
      cloudMember(CLOUD_PLAYER_IDS.south, 'Tyler'),
      cloudMember(CLOUD_PLAYER_IDS.west, 'West'),
      cloudMember(CLOUD_PLAYER_IDS.north, 'North'),
    ] });
    const result = parseCloudArchiveSource(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid source');
    expect(result.source.players.filter((player) => player.displayName === 'Tyler').map((player) => player.id)).toEqual([
      CLOUD_PLAYER_IDS.east, CLOUD_PLAYER_IDS.south,
    ]);
  });

  it('keeps a member UID and tempPlayerId distinct when their display names match', () => {
    const fixture = createCloudArchiveFixture({
      tempPlayers: [cloudTemporaryPlayer(CLOUD_PLAYER_IDS.temp, 'East')],
    });
    const result = parseCloudArchiveSource(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid source');
    expect(result.source.players.filter((player) => player.displayName === 'East').map((player) => player.id)).toEqual([
      CLOUD_PLAYER_IDS.east, CLOUD_PLAYER_IDS.temp,
    ]);
  });

  it('rejects duplicate member/temp IDs, malformed names, and wrong room ownership', () => {
    const duplicate = createCloudArchiveFixture();
    duplicate.tempPlayers.push({
      tempPlayerId: CLOUD_PLAYER_IDS.east,
      roomId: duplicate.room.roomId,
      createdByUid: CLOUD_PLAYER_IDS.east,
      displayName: 'Duplicate',
      createdAt: 1,
      updatedAt: 1,
    });
    expect(codes(duplicate)).toContain('DUPLICATE_CLOUD_PLAYER_IDENTITY');

    const malformed = createCloudArchiveFixture();
    malformed.members[0].displayName = '   ';
    expect(codes(malformed)).toContain('MALFORMED_CLOUD_PLAYER');

    const wrongRoom = createCloudArchiveFixture();
    wrongRoom.members[0].roomId = 'other-room';
    expect(codes(wrongRoom)).toContain('MALFORMED_CLOUD_PLAYER');
  });

  it('validates exactly four unique known identities in every lineup', () => {
    const unknown = createCloudArchiveFixture();
    unknown.lineups[0].seats['3'] = 'missing-player';
    expect(codes(unknown)).toContain('UNKNOWN_CLOUD_PLAYER_IDENTITY');

    const duplicate = createCloudArchiveFixture();
    duplicate.lineups[0].seats['3'] = duplicate.lineups[0].seats['0'];
    expect(codes(duplicate)).toContain('DUPLICATE_CLOUD_LINEUP_PLAYER');

    const incomplete = createCloudArchiveFixture();
    incomplete.lineups[0].seats['3'] = null;
    expect(codes(incomplete)).toContain('INVALID_CLOUD_LINEUP_PLAYER_COUNT');
  });

  it('rejects duplicate lineup versions and out-of-range effective indexes', () => {
    const duplicate = createCloudArchiveFixture({ lineups: [
      cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
      cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 1 }),
    ] });
    expect(codes(duplicate)).toContain('DUPLICATE_CLOUD_LINEUP_VERSION');

    const invalidBoundary = createCloudArchiveFixture({ lineups: [
      cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
      cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2 }),
    ] });
    expect(codes(invalidBoundary)).toContain('INVALID_CLOUD_LINEUP_EFFECTIVE_INDEX');
  });

  it('strictly accepts supported traditional and custom HK rule snapshots', () => {
    const traditional = createCloudArchiveFixture({ rules: traditionalRules() });
    const custom = createCloudArchiveFixture({ rules: customRules({ unitPerFan: 0.5, capFan: 5 }) });
    expect(parseCloudArchiveSource(traditional).ok).toBe(true);
    expect(parseCloudArchiveSource(custom).ok).toBe(true);
  });

  it('rejects malformed and unsupported rules without default fallback', () => {
    const missing = createCloudArchiveFixture();
    missing.room.rulesSnapshot = {};
    expect(codes(missing)).toContain('CORRUPTED_RULES_SNAPSHOT');

    const malformed = createCloudArchiveFixture();
    malformed.room.rulesSnapshot = { serializedRules: '{bad' };
    expect(codes(malformed)).toContain('CORRUPTED_RULES_SNAPSHOT');

    const incomplete = createCloudArchiveFixture();
    incomplete.room.rulesSnapshot = { serializedRules: JSON.stringify({ version: 1, variant: 'HK', mode: 'HK' }) };
    expect(codes(incomplete)).toContain('CORRUPTED_RULES_SNAPSHOT');

    const unsupported = createCloudArchiveFixture();
    unsupported.room.rulesSnapshot = cloudRulesSnapshot({ ...traditionalRules(), variant: 'TW', mode: 'TW' });
    expect(codes(unsupported)).toContain('UNSUPPORTED_RULE_VARIANT');
  });

  it('rejects invalid outcome combinations, draw action, fan, and winner equality', () => {
    const invalidDraw = createCloudArchiveFixture({ hands: [cloudHand({ handIndex: 1, type: 'draw' })] });
    invalidDraw.hands[0].dealerAction = null;
    expect(codes(invalidDraw)).toContain('INVALID_CLOUD_HAND');

    const invalidFan = createCloudArchiveFixture({ hands: [cloudHand({ handIndex: 1, type: 'zimo' })] });
    invalidFan.hands[0].fan = 3.5;
    expect(codes(invalidFan)).toContain('INVALID_CLOUD_HAND');

    const equal = createCloudArchiveFixture({ hands: [cloudHand({ handIndex: 1, type: 'discard' })] });
    equal.hands[0].discarderPlayerId = equal.hands[0].winnerPlayerId;
    expect(codes(equal)).toContain('INVALID_CLOUD_HAND');
  });

  it('rejects missing referenced member/temp identities in hand history', () => {
    const fixture = createCloudArchiveFixture({ hands: [cloudHand({
      handIndex: 1,
      type: 'zimo',
      winnerPlayerId: CLOUD_PLAYER_IDS.temp,
    })] });
    expect(codes(fixture)).toContain('UNKNOWN_CLOUD_PLAYER_IDENTITY');

    const missingDiscarder = createCloudArchiveFixture({ hands: [cloudHand({
      handIndex: 1,
      type: 'discard',
      winnerPlayerId: CLOUD_PLAYER_IDS.east,
      discarderPlayerId: 'missing-discarder',
    })] });
    expect(codes(missingDiscarder)).toContain('UNKNOWN_CLOUD_PLAYER_IDENTITY');
  });

  it('returns stable diagnostics for malformed structural input and never throws', () => {
    expect(() => parseCloudArchiveSource(null)).not.toThrow();
    expect(codes(null)).toEqual(['MALFORMED_CLOUD_SOURCE']);

    const malformed = cloneCloudFixture(createCloudArchiveFixture()) as unknown as { room: unknown; hands: unknown };
    malformed.hands = {};
    expect(codes(malformed)).toContain('MALFORMED_CLOUD_SOURCE');
  });
});
