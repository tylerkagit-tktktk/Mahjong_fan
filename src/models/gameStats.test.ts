import { computeGameStats } from './gameStats';

function createBundle() {
  return {
    game: {
      id: 'g1',
      title: 'stats',
      createdAt: 1,
      endedAt: 2,
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 0,
      progressIndex: 0,
      currentWindIndex: 0,
      currentRoundNumber: 1,
      maxWindIndex: 1,
      gameState: 'ended',
      currentRoundLabelZh: '東風南局',
      resultStatus: 'result',
      resultSummaryJson: null,
      resultUpdatedAt: null,
      handsCount: 5,
      seatRotationOffset: 0,
      languageOverride: null,
    },
    players: [
      { id: 'p0', gameId: 'g1', name: 'A', seatIndex: 0 },
      { id: 'p1', gameId: 'g1', name: 'B', seatIndex: 1 },
      { id: 'p2', gameId: 'g1', name: 'C', seatIndex: 2 },
      { id: 'p3', gameId: 'g1', name: 'D', seatIndex: 3 },
    ],
    hands: [
      {
        id: 'h1',
        gameId: 'g1',
        handIndex: 0,
        dealerSeatIndex: 0,
        windIndex: 0,
        roundNumber: 1,
        isDraw: false,
        winnerSeatIndex: 0,
        type: 'fan',
        winnerPlayerId: 'p0',
        discarderPlayerId: 'p1',
        inputValue: 0,
        deltasJson: '[12,-12,0,0]',
        computedJson: JSON.stringify({ settlementType: 'discard' }),
        nextRoundLabelZh: '東風南局',
        createdAt: 1,
      },
      {
        id: 'h2',
        gameId: 'g1',
        handIndex: 1,
        dealerSeatIndex: 1,
        windIndex: 0,
        roundNumber: 2,
        isDraw: false,
        winnerSeatIndex: 2,
        type: 'fan',
        winnerPlayerId: 'p2',
        discarderPlayerId: 'p1',
        inputValue: 0,
        deltasJson: '[-8,-8,24,-8]',
        computedJson: JSON.stringify({ settlementType: 'discard' }),
        nextRoundLabelZh: '西風東局',
        createdAt: 2,
      },
      {
        id: 'h3',
        gameId: 'g1',
        handIndex: 2,
        dealerSeatIndex: 2,
        windIndex: 0,
        roundNumber: 3,
        isDraw: false,
        winnerSeatIndex: 3,
        type: 'fan',
        winnerPlayerId: 'p3',
        discarderPlayerId: null,
        inputValue: 0,
        deltasJson: '[-8,-8,-8,24]',
        computedJson: JSON.stringify({ settlementType: 'zimo' }),
        nextRoundLabelZh: '北風東局',
        createdAt: 3,
      },
      {
        id: 'h4',
        gameId: 'g1',
        handIndex: 3,
        dealerSeatIndex: 3,
        windIndex: 0,
        roundNumber: 4,
        isDraw: false,
        winnerSeatIndex: 3,
        type: 'fan',
        winnerPlayerId: 'p3',
        discarderPlayerId: null,
        inputValue: 0,
        deltasJson: '[-4,-4,-4,12]',
        computedJson: JSON.stringify({ settlementType: 'zimo' }),
        nextRoundLabelZh: '南風東局',
        createdAt: 4,
      },
      {
        id: 'h5',
        gameId: 'g1',
        handIndex: 4,
        dealerSeatIndex: 0,
        windIndex: 1,
        roundNumber: 1,
        isDraw: true,
        winnerSeatIndex: null,
        type: 'draw',
        winnerPlayerId: null,
        discarderPlayerId: null,
        inputValue: 0,
        deltasJson: '[0,0,0,0]',
        computedJson: JSON.stringify({ dealerAction: 'stick' }),
        nextRoundLabelZh: '南風東局',
        createdAt: 5,
      },
    ],
  } as const;
}

describe('computeGameStats', () => {
  it('computes most discarder and most zimo from hand timeline', () => {
    const stats = computeGameStats(createBundle() as any);
    expect(stats.mostDiscarder).toMatchObject({
      playerId: 'p1',
      name: 'B',
      count: 2,
    });
    expect(stats.mostZimo).toMatchObject({
      playerId: 'p3',
      name: 'D',
      count: 2,
    });
  });

  it('returns null for mostDiscarder when no discard hands exist', () => {
    const bundle = createBundle() as any;
    bundle.hands = bundle.hands.map((hand: any) => ({
      ...hand,
      discarderPlayerId: null,
      computedJson: JSON.stringify({ settlementType: hand.isDraw ? 'draw' : 'zimo' }),
    }));
    const stats = computeGameStats(bundle);
    expect(stats.mostDiscarder).toBeNull();
    expect(stats.mostZimo).not.toBeNull();
  });
});
