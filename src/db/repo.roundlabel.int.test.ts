import { createGameWithPlayers, getGameBundle, insertHand, wipeAllData } from './repo';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildPlayers(gameId: string) {
  return [
    { id: makeId('p1'), gameId, name: 'A', seatIndex: 0 },
    { id: makeId('p2'), gameId, name: 'B', seatIndex: 1 },
    { id: makeId('p3'), gameId, name: 'C', seatIndex: 2 },
    { id: makeId('p4'), gameId, name: 'D', seatIndex: 3 },
  ];
}

const describeIfNativeSqlite =
  typeof (global as { nativeCallSyncHook?: unknown }).nativeCallSyncHook === 'function'
    ? describe
    : describe.skip;

describeIfNativeSqlite('repo round label integration', () => {
  beforeEach(async () => {
    await wipeAllData();
  });

  it('updates currentRoundLabelZh using dealer engine progression', async () => {
    const gameId = makeId('roundlabel-int');
    const players = buildPlayers(gameId);
    const now = Date.now();

    await createGameWithPlayers(
      {
        id: gameId,
        title: 'Round Label Integration',
        currencySymbol: 'HK$',
        variant: 'HK',
        rulesJson: '{}',
        startingDealerSeatIndex: 0,
        createdAt: now,
      },
      players,
    );

    await insertHand({
      id: makeId('h1'),
      gameId,
      dealerSeatIndex: 0,
      isDraw: false,
      winnerSeatIndex: 1,
      type: 'discard',
      winnerPlayerId: players[1].id,
      discarderPlayerId: players[0].id,
      inputValue: 0,
      deltasJson: JSON.stringify([-10, 30, -10, -10]),
      computedJson: JSON.stringify({}),
      createdAt: now + 1,
    });
    await insertHand({
      id: makeId('h2'),
      gameId,
      dealerSeatIndex: 1,
      isDraw: false,
      winnerSeatIndex: 2,
      type: 'discard',
      winnerPlayerId: players[2].id,
      discarderPlayerId: players[1].id,
      inputValue: 0,
      deltasJson: JSON.stringify([-10, -10, 30, -10]),
      computedJson: JSON.stringify({}),
      createdAt: now + 2,
    });
    await insertHand({
      id: makeId('h3'),
      gameId,
      dealerSeatIndex: 2,
      isDraw: false,
      winnerSeatIndex: 3,
      type: 'discard',
      winnerPlayerId: players[3].id,
      discarderPlayerId: players[2].id,
      inputValue: 0,
      deltasJson: JSON.stringify([-10, -10, -10, 30]),
      computedJson: JSON.stringify({}),
      createdAt: now + 3,
    });
    await insertHand({
      id: makeId('h4'),
      gameId,
      dealerSeatIndex: 3,
      isDraw: false,
      winnerSeatIndex: 0,
      type: 'discard',
      winnerPlayerId: players[0].id,
      discarderPlayerId: players[3].id,
      inputValue: 0,
      deltasJson: JSON.stringify([30, -10, -10, -10]),
      computedJson: JSON.stringify({}),
      createdAt: now + 4,
    });

    let bundle = await getGameBundle(gameId);
    expect(bundle.game.currentRoundLabelZh).toBe('南風東局');

    await insertHand({
      id: makeId('h5'),
      gameId,
      dealerSeatIndex: 0,
      isDraw: true,
      winnerSeatIndex: null,
      type: 'draw',
      winnerPlayerId: null,
      discarderPlayerId: null,
      inputValue: 0,
      deltasJson: null,
      computedJson: JSON.stringify({ dealerAction: 'stick' }),
      createdAt: now + 5,
    });
    bundle = await getGameBundle(gameId);
    expect(bundle.game.currentRoundLabelZh).toBe('南風東局');

    await insertHand({
      id: makeId('h6'),
      gameId,
      dealerSeatIndex: 0,
      isDraw: true,
      winnerSeatIndex: null,
      type: 'draw',
      winnerPlayerId: null,
      discarderPlayerId: null,
      inputValue: 0,
      deltasJson: null,
      computedJson: JSON.stringify({ dealerAction: 'pass' }),
      createdAt: now + 6,
    });
    bundle = await getGameBundle(gameId);
    expect(bundle.game.currentRoundLabelZh).toBe('南風南局');
  });
});
