import AsyncStorage from '@react-native-async-storage/async-storage';
import { importActiveGameBundle } from '../../../src/db/repo';
import { aggregatePlayerTotalsQByTimeline } from '../../../src/models/seatRotation';
import {
  abandonSyncAndCreateLocalGame,
  buildLocalTakeoverBundle,
  LocalTakeoverError,
} from '../../../src/services/cloud/localTakeoverRepo';
import {
  loadActiveHostedRoomPointer,
  loadActiveRoomRecoverySnapshot,
  loadPendingHostedRoomCleanup,
  mergeActiveRoomRecoverySnapshot,
  saveActiveHostedRoomPointer,
} from '../../../src/services/cloud/storage';

jest.mock('../../../src/db/repo', () => ({
  importActiveGameBundle: jest.fn(),
}));

const mockedImportActiveGameBundle = importActiveGameBundle as jest.MockedFunction<typeof importActiveGameBundle>;

const serializedRules = JSON.stringify({
  version: 1,
  variant: 'HK',
  mode: 'HK',
  currencyCode: 'HKD',
  currencySymbol: 'HK$',
  minFanToWin: 3,
  hk: {
    scoringPreset: 'traditionalFan',
    gunMode: 'fullGun',
    stakePreset: 'TWO_FIVE_CHICKEN',
    capFan: 10,
    unitPerFan: 1,
  },
});

function lineup(version: number, seats: string[]) {
  return {
    lineupId: `lineup-${version}`,
    roomId: 'room-1',
    effectiveFromHandIndex: version === 1 ? 0 : 2,
    seats: { '0': seats[0], '1': seats[1], '2': seats[2], '3': seats[3] },
    createdByUid: 'p1',
    createdAt: 1000 + version,
    baseVersion: version,
    lineupVersion: version,
  } as any;
}

function snapshot(currentSeats = ['p3', 'p2', 'p1', 'p4']) {
  const initialLineup = lineup(1, ['p1', 'p2', 'p3', 'p4']);
  const currentLineup = lineup(2, currentSeats);
  return {
    roomId: 'room-1',
    savedAt: 3000,
    room: {
      roomId: 'room-1',
      title: 'Cloud game',
      hostUid: 'p1',
      status: 'active',
      currentHandIndex: 1,
      activeLineupVersion: 2,
      rulesSnapshot: { serializedRules },
      createdAt: 1000,
    },
    players: ['p1', 'p2', 'p3', 'p4', 'p5'].map((playerId, index) => ({
      playerId,
      roomId: 'room-1',
      kind: 'member',
      uid: playerId,
      displayName: `Player ${index + 1}`,
      avatarUrl: null,
      isHost: playerId === 'p1',
      isSelf: playerId === 'p1',
      joinedAt: 1000 + index,
    })),
    lineup: currentLineup,
    lineups: [initialLineup, currentLineup],
    hands: [
      {
        handId: '1',
        roomId: 'room-1',
        handIndex: 1,
        type: 'discard',
        submittedByUid: 'p1',
        baseVersion: 1,
        serverVersion: 2,
        lineupVersion: 1,
        winnerPlayerId: 'p1',
        discarderPlayerId: 'p2',
        dealerAction: null,
        fan: 3,
        createdAt: 2000,
      },
    ],
  } as any;
}

describe('local cloud takeover conversion', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedImportActiveGameBundle.mockResolvedValue({ created: true });
  });

  it('preserves player totals after a same-player reseat', () => {
    const bundle = buildLocalTakeoverBundle(snapshot(), 'p1');
    const totals = aggregatePlayerTotalsQByTimeline(
      bundle.players,
      bundle.hands.map((hand) => ({
        nextRoundLabelZh: hand.nextRoundLabelZh,
        deltasQ: (JSON.parse(hand.deltasJson!) as { values: number[] }).values,
      })),
      '東風東局',
      0,
    );
    const player1 = bundle.players.find((player) => player.name === 'Player 1')!;
    const player2 = bundle.players.find((player) => player.name === 'Player 2')!;

    expect(bundle.players.map((player) => player.name)).toEqual(['Player 3', 'Player 2', 'Player 1', 'Player 4']);
    expect(totals.get(player1.id)).toBeGreaterThan(0);
    expect(totals.get(player2.id)).toBeLessThan(0);
    expect(bundle.hands[0].winnerPlayerId).toBe(player1.id);
  });

  it('refuses conversion when a fifth player appeared in hand history', () => {
    const value = snapshot(['p3', 'p2', 'p1', 'p4']);
    value.lineups[0] = lineup(1, ['p1', 'p2', 'p3', 'p5']);

    expect(() => buildLocalTakeoverBundle(value, 'p1')).toThrow(
      expect.objectContaining<Partial<LocalTakeoverError>>({ code: 'PLAYER_SET_CHANGED' }),
    );
  });

  it('refuses a snapshot that is missing a synced hand', () => {
    const value = snapshot();
    value.room.currentHandIndex = 2;

    expect(() => buildLocalTakeoverBundle(value, 'p1')).toThrow(
      expect.objectContaining<Partial<LocalTakeoverError>>({ code: 'SNAPSHOT_INCOMPLETE' }),
    );
  });

  it('refuses a non-host takeover', () => {
    expect(() => buildLocalTakeoverBundle(snapshot(), 'p2')).toThrow(
      expect.objectContaining<Partial<LocalTakeoverError>>({ code: 'NOT_HOST' }),
    );
  });

  it('records pending cloud cleanup only after the local import succeeds', async () => {
    const value = snapshot();
    await mergeActiveRoomRecoverySnapshot('room-1', {
      room: value.room,
      players: value.players,
      lineup: value.lineup,
      lineups: value.lineups,
      hands: value.hands,
    });
    await saveActiveHostedRoomPointer({ uid: 'p1', roomId: 'room-1' });

    const gameId = await abandonSyncAndCreateLocalGame('room-1', 'p1');

    expect(mockedImportActiveGameBundle).toHaveBeenCalledTimes(1);
    expect(await loadPendingHostedRoomCleanup()).toEqual(expect.objectContaining({
      uid: 'p1',
      roomId: 'room-1',
      localGameId: gameId,
    }));
    expect(await loadActiveHostedRoomPointer()).toBeNull();
    expect(await loadActiveRoomRecoverySnapshot('room-1')).toBeNull();
  });
});
