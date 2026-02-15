import {
  buildSeatRotationOffsetsByHand,
  getBaseSeatForEffectiveSeat,
  getEffectivePlayersBySeat,
  getEffectiveSeatForPlayer,
  normalizeSeatRotationOffset,
} from './seatRotation';

describe('seatRotation helpers', () => {
  const players = [0, 1, 2, 3].map((seatIndex) => ({
    id: `p${seatIndex}`,
    gameId: 'g1',
    name: `P${seatIndex}`,
    seatIndex,
  }));

  it('normalizes offset and maps seat rotation 0..3', () => {
    expect(normalizeSeatRotationOffset(0)).toBe(0);
    expect(normalizeSeatRotationOffset(1)).toBe(1);
    expect(normalizeSeatRotationOffset(2)).toBe(2);
    expect(normalizeSeatRotationOffset(3)).toBe(3);
    expect(normalizeSeatRotationOffset(4)).toBe(0);
    expect(normalizeSeatRotationOffset(-1)).toBe(3);
  });

  it('rotates E,S,W,N +1 per cycle', () => {
    const bySeatOffset1 = getEffectivePlayersBySeat(players, 1);
    expect(bySeatOffset1[0]?.id).toBe('p3');
    expect(bySeatOffset1[1]?.id).toBe('p0');
    expect(bySeatOffset1[2]?.id).toBe('p1');
    expect(bySeatOffset1[3]?.id).toBe('p2');
  });

  it('inverse mapping stays consistent', () => {
    const offset = 2;
    for (let baseSeat = 0; baseSeat < 4; baseSeat += 1) {
      const effectiveSeat = getEffectiveSeatForPlayer(baseSeat, offset);
      expect(getBaseSeatForEffectiveSeat(effectiveSeat, offset)).toBe(baseSeat);
    }
  });

  it('builds per-hand offsets and rotates after 北風→東風 wrap', () => {
    const offsets = buildSeatRotationOffsetsByHand(
      [
        { nextRoundLabelZh: '北風北局' },
        { nextRoundLabelZh: '東風東局' },
        { nextRoundLabelZh: '東風南局' },
      ],
      '北風西局',
      0,
    );
    expect(offsets).toEqual([0, 0, 1]);
  });
});
