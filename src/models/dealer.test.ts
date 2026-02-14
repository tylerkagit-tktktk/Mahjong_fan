import { Hand } from './db';
import { getNextDealerSeatIndex, getRoundLabel } from './dealer';

function makeHand(partial: Partial<Hand>): Hand {
  return {
    id: 'hand-1',
    gameId: 'game-1',
    handIndex: 0,
    dealerSeatIndex: 0,
    windIndex: 0,
    roundNumber: 1,
    isDraw: false,
    winnerSeatIndex: 0,
    type: 'discard',
    winnerPlayerId: null,
    discarderPlayerId: null,
    inputValue: null,
    deltasJson: null,
    computedJson: '{}',
    createdAt: 0,
    ...partial,
  };
}

describe('dealer progression', () => {
  it('dealer win keeps same dealer', () => {
    expect(
      getNextDealerSeatIndex({
        dealerSeatIndex: 0,
        isDraw: false,
        winnerSeatIndex: 0,
      }),
    ).toBe(0);
  });

  it('non-dealer win advances dealer', () => {
    expect(
      getNextDealerSeatIndex({
        dealerSeatIndex: 0,
        isDraw: false,
        winnerSeatIndex: 2,
      }),
    ).toBe(1);
  });

  it('draw with stick keeps dealer', () => {
    const round = getRoundLabel(
      0,
      [
        makeHand({
          dealerSeatIndex: 0,
          isDraw: true,
          winnerSeatIndex: null,
          computedJson: JSON.stringify({ dealerAction: 'stick' }),
        }),
      ],
    );

    expect(round.labelZh).toBe('東風東局');
  });

  it('draw with pass advances dealer', () => {
    const round = getRoundLabel(
      0,
      [
        makeHand({
          dealerSeatIndex: 0,
          isDraw: true,
          winnerSeatIndex: null,
          computedJson: JSON.stringify({ dealerAction: 'pass' }),
        }),
      ],
    );

    expect(round.labelZh).toBe('東風南局');
  });

  it('four dealer advances increments wind', () => {
    const round = getRoundLabel(0, [
      makeHand({ id: 'h1', handIndex: 0, dealerSeatIndex: 0, isDraw: false, winnerSeatIndex: 1 }),
      makeHand({ id: 'h2', handIndex: 1, dealerSeatIndex: 1, isDraw: false, winnerSeatIndex: 2 }),
      makeHand({ id: 'h3', handIndex: 2, dealerSeatIndex: 2, isDraw: false, winnerSeatIndex: 3 }),
      makeHand({ id: 'h4', handIndex: 3, dealerSeatIndex: 3, isDraw: false, winnerSeatIndex: 0 }),
    ]);

    expect(round.labelZh).toBe('南風東局');
    expect(round.roundIndex).toBe(2);
  });
});
