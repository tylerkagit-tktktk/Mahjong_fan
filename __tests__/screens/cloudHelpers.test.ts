import {
  getCloudRoundLabel,
  getDealerSeatIndexAfterHand,
  getLineupForHand,
  getSeatPlayerIds,
} from '../../src/screens/cloud/helpers';
import type { HandLog, RoomLineup } from '../../src/models/cloud';

function makeLineup(overrides: Partial<RoomLineup> = {}): RoomLineup {
  return {
    lineupId: 'lineup-1',
    roomId: 'room-1',
    effectiveFromHandIndex: 0,
    seats: { '0': 'p0', '1': 'p1', '2': 'p2', '3': 'p3' },
    createdByUid: 'host-1',
    createdAt: 0,
    baseVersion: 1,
    lineupVersion: 1,
    ...overrides,
  };
}

function makeHand(overrides: Partial<HandLog> = {}): HandLog {
  return {
    handId: 'hand-1',
    roomId: 'room-1',
    handIndex: 0,
    type: 'discard',
    winnerPlayerId: 'p1',
    discarderPlayerId: 'p0',
    dealerAction: null,
    fan: 3,
    submittedByUid: 'host-1',
    baseVersion: 1,
    serverVersion: 2,
    lineupVersion: 1,
    createdAt: 0,
    ...overrides,
  };
}

describe('cloud screen helpers', () => {
  it('keeps cloud seat and round calculations in one shared module', () => {
    const lineup = makeLineup();

    expect(getSeatPlayerIds(lineup)).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(getCloudRoundLabel(2, 1)).toBe('南風南局');
    expect(getDealerSeatIndexAfterHand(0, makeHand(), lineup)).toBe(1);
    expect(
      getDealerSeatIndexAfterHand(1, makeHand({ type: 'draw', winnerPlayerId: null, discarderPlayerId: null, dealerAction: 'pass' }), lineup),
    ).toBe(2);
  });

  it('resolves a hand lineup by version, then effective hand index', () => {
    const initial = makeLineup();
    const later = makeLineup({ lineupId: 'lineup-2', lineupVersion: 2, effectiveFromHandIndex: 3 });

    expect(getLineupForHand([initial, later], makeHand({ lineupVersion: 2, handIndex: 3 }))).toBe(later);
    expect(getLineupForHand([initial, later], makeHand({ lineupVersion: 99, handIndex: 4 }))).toBe(later);
    expect(getLineupForHand([initial, later], makeHand({ lineupVersion: 99, handIndex: 1 }))).toBe(initial);
  });
});
