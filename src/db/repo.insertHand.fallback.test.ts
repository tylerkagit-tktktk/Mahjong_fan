import { NewHandInput, Hand } from '../models/db';
import { getRoundLabel } from '../models/dealer';
import { __testOnly_insertHandWithTx } from './repo';

type MockGameRow = {
  id: string;
  endedAt: number | null;
  gameState: 'draft' | 'active' | 'ended' | 'abandoned';
  startingDealerSeatIndex: number;
  currentWindIndex: number;
  currentRoundNumber: number;
  handsCount: number;
  currentRoundLabelZh: string | null;
};

type MockRowSet<T> = {
  rows: {
    length: number;
    item: (index: number) => T;
  };
};

type TxState = {
  game: MockGameRow;
  hands: Array<{
    id: string;
    gameId: string;
    handIndex: number;
    dealerSeatIndex: number;
    windIndex: number;
    roundNumber: number;
    isDraw: number | boolean;
    winnerSeatIndex: number | null;
    type: string;
    winnerPlayerId: string | null;
    discarderPlayerId: string | null;
    inputValue: number | null;
    deltasJson: string | null;
    nextRoundLabelZh: string | null;
    computedJson: string | null;
    createdAt: number;
  }>;
};

function createRowSet<T>(items: T[]): MockRowSet<T> {
  return {
    rows: {
      length: items.length,
      item: (index: number) => items[index],
    },
  };
}

function buildExecuteTx(state: TxState) {
  return async (statement: string, params: Array<string | number | null> = []) => {
    if (statement.startsWith('SELECT endedAt, gameState, startingDealerSeatIndex')) {
      return createRowSet([
        {
          endedAt: state.game.endedAt,
          gameState: state.game.gameState,
          startingDealerSeatIndex: state.game.startingDealerSeatIndex,
          currentWindIndex: state.game.currentWindIndex,
          currentRoundNumber: state.game.currentRoundNumber,
        },
      ]);
    }

    if (statement.startsWith('SELECT MAX(handIndex) as maxIndex FROM hands')) {
      const gameId = String(params[0]);
      const matching = state.hands.filter((hand) => hand.gameId === gameId);
      const maxIndex = matching.length > 0 ? Math.max(...matching.map((hand) => hand.handIndex)) : null;
      return createRowSet([{ maxIndex }]);
    }

    if (statement.startsWith('INSERT INTO hands')) {
      state.hands.push({
        id: String(params[0]),
        gameId: String(params[1]),
        handIndex: Number(params[2]),
        dealerSeatIndex: Number(params[3]),
        windIndex: Number(params[4]),
        roundNumber: Number(params[5]),
        isDraw: Number(params[6]),
        winnerSeatIndex: params[7] == null ? null : Number(params[7]),
        type: String(params[8]),
        winnerPlayerId: params[9] == null ? null : String(params[9]),
        discarderPlayerId: params[10] == null ? null : String(params[10]),
        inputValue: params[11] == null ? null : Number(params[11]),
        deltasJson: params[12] == null ? null : String(params[12]),
        computedJson: params[13] == null ? null : String(params[13]),
        nextRoundLabelZh: null,
        createdAt: Number(params[14]),
      });
      return createRowSet([]);
    }

    if (statement.startsWith('SELECT * FROM hands WHERE gameId = ? ORDER BY handIndex ASC;')) {
      const gameId = String(params[0]);
      const matching = state.hands
        .filter((hand) => hand.gameId === gameId)
        .sort((a, b) => a.handIndex - b.handIndex);
      return createRowSet(matching);
    }

    if (statement.startsWith('UPDATE hands SET nextRoundLabelZh = ? WHERE id = ?;')) {
      const label = params[0] == null ? null : String(params[0]);
      const handId = String(params[1]);
      const target = state.hands.find((hand) => hand.id === handId);
      if (target) {
        target.nextRoundLabelZh = label;
      }
      return createRowSet([]);
    }

    if (statement.includes('SET handsCount = COALESCE(handsCount, 0) + 1,')) {
      state.game.handsCount += 1;
      state.game.currentRoundLabelZh = params[0] == null ? null : String(params[0]);
      state.game.gameState = String(params[1]) as MockGameRow['gameState'];
      return createRowSet([]);
    }

    if (statement.startsWith('SELECT currentRoundLabelZh FROM games WHERE id = ? LIMIT 1;')) {
      return createRowSet([{ currentRoundLabelZh: state.game.currentRoundLabelZh }]);
    }

    throw new Error(`Unhandled SQL in test: ${statement}`);
  };
}

function createInitialState(gameId: string): TxState {
  return {
    game: {
      id: gameId,
      endedAt: null,
      gameState: 'active',
      startingDealerSeatIndex: 0,
      currentWindIndex: 0,
      currentRoundNumber: 1,
      handsCount: 0,
      currentRoundLabelZh: '東風東局',
    },
    hands: [],
  };
}

function createDrawInput(gameId: string, computedJson: string): NewHandInput {
  return {
    id: `${gameId}-h1`,
    gameId,
    dealerSeatIndex: 0,
    isDraw: true,
    winnerSeatIndex: null,
    type: 'draw',
    winnerPlayerId: null,
    discarderPlayerId: null,
    inputValue: 0,
    deltasJson: null,
    computedJson,
    createdAt: Date.now(),
  };
}

function createNormalInput(params: {
  gameId: string;
  id: string;
  dealerSeatIndex: number;
  winnerSeatIndex: number;
}): NewHandInput {
  return {
    id: params.id,
    gameId: params.gameId,
    dealerSeatIndex: params.dealerSeatIndex,
    isDraw: false,
    winnerSeatIndex: params.winnerSeatIndex,
    type: 'discard',
    winnerPlayerId: `winner-${params.winnerSeatIndex}`,
    discarderPlayerId: `discarder-${params.dealerSeatIndex}`,
    inputValue: 0,
    deltasJson: JSON.stringify([10, -5, -3, -2]),
    computedJson: JSON.stringify({ source: 'test' }),
    createdAt: Date.now(),
  };
}

function mapHandsForDealer(state: TxState): Hand[] {
  return state.hands.map((hand) => ({
    id: hand.id,
    gameId: hand.gameId,
    handIndex: hand.handIndex,
    dealerSeatIndex: hand.dealerSeatIndex,
    windIndex: hand.windIndex,
    roundNumber: hand.roundNumber,
    isDraw: Boolean(hand.isDraw),
    winnerSeatIndex: hand.winnerSeatIndex,
    type: hand.type,
    winnerPlayerId: hand.winnerPlayerId,
    discarderPlayerId: hand.discarderPlayerId,
    inputValue: hand.inputValue,
    deltasJson: hand.deltasJson,
    nextRoundLabelZh: hand.nextRoundLabelZh,
    computedJson: hand.computedJson ?? '{}',
    createdAt: hand.createdAt,
  }));
}

describe('repo insertHand draw fallback', () => {
  it('defaults dealerAction to stick when computedJson is empty object', async () => {
    const state = createInitialState('game-fallback-1');
    const executeTx = buildExecuteTx(state);

    const insertedHand = await __testOnly_insertHandWithTx(createDrawInput('game-fallback-1', '{}'), executeTx);

    const inserted = state.hands[0];
    expect(inserted).toBeDefined();
    expect(JSON.parse(inserted.computedJson ?? '{}').dealerAction).toBe('stick');
    const expected = getRoundLabel(state.game.startingDealerSeatIndex, mapHandsForDealer(state)).labelZh;
    expect(insertedHand.nextRoundLabelZh).toBe(expected);
    expect(state.game.currentRoundLabelZh).toBe(expected);
  });

  it('defaults dealerAction to stick when computedJson is invalid json', async () => {
    const state = createInitialState('game-fallback-2');
    const executeTx = buildExecuteTx(state);

    const insertedHand = await __testOnly_insertHandWithTx(createDrawInput('game-fallback-2', 'not-json'), executeTx);

    const inserted = state.hands[0];
    expect(inserted).toBeDefined();
    expect(() => JSON.parse(inserted.computedJson ?? '')).not.toThrow();
    expect(JSON.parse(inserted.computedJson ?? '{}').dealerAction).toBe('stick');
    const expected = getRoundLabel(state.game.startingDealerSeatIndex, mapHandsForDealer(state)).labelZh;
    expect(insertedHand.nextRoundLabelZh).toBe(expected);
    expect(state.game.currentRoundLabelZh).toBe(expected);
  });

  it('keeps pass dealerAction and advances round label', async () => {
    const state = createInitialState('game-fallback-3');
    const executeTx = buildExecuteTx(state);

    const insertedHand = await __testOnly_insertHandWithTx(
      createDrawInput('game-fallback-3', JSON.stringify({ dealerAction: 'pass' })),
      executeTx,
    );

    const inserted = state.hands[0];
    expect(JSON.parse(inserted.computedJson ?? '{}').dealerAction).toBe('pass');

    const expected = getRoundLabel(state.game.startingDealerSeatIndex, mapHandsForDealer(state)).labelZh;
    expect(expected).toBe('東風南局');
    expect(insertedHand.nextRoundLabelZh).toBe(expected);
    expect(state.game.currentRoundLabelZh).toBe(expected);
  });

  it('keeps stick dealerAction and does not advance round label', async () => {
    const state = createInitialState('game-fallback-4');
    const executeTx = buildExecuteTx(state);

    const insertedHand = await __testOnly_insertHandWithTx(
      createDrawInput('game-fallback-4', JSON.stringify({ dealerAction: 'stick' })),
      executeTx,
    );

    const inserted = state.hands[0];
    expect(JSON.parse(inserted.computedJson ?? '{}').dealerAction).toBe('stick');

    const expected = getRoundLabel(state.game.startingDealerSeatIndex, mapHandsForDealer(state)).labelZh;
    expect(expected).toBe('東風東局');
    expect(insertedHand.nextRoundLabelZh).toBe(expected);
    expect(state.game.currentRoundLabelZh).toBe(expected);
  });

  it('advances one dealer on non-draw when winner is not dealer', async () => {
    const state = createInitialState('game-fallback-5');
    const executeTx = buildExecuteTx(state);

    const insertedHand = await __testOnly_insertHandWithTx(
      createNormalInput({
        gameId: 'game-fallback-5',
        id: 'game-fallback-5-h1',
        dealerSeatIndex: 0,
        winnerSeatIndex: 1,
      }),
      executeTx,
    );

    const expected = getRoundLabel(state.game.startingDealerSeatIndex, mapHandsForDealer(state)).labelZh;
    expect(expected).toBe('東風南局');
    expect(insertedHand.nextRoundLabelZh).toBe(expected);
    expect(state.game.currentRoundLabelZh).toBe(expected);
  });

  it('moves to 南風東局 after four consecutive dealer advances', async () => {
    const state = createInitialState('game-fallback-6');
    const executeTx = buildExecuteTx(state);

    const hands = [
      { id: 'game-fallback-6-h1', dealerSeatIndex: 0, winnerSeatIndex: 1 },
      { id: 'game-fallback-6-h2', dealerSeatIndex: 1, winnerSeatIndex: 2 },
      { id: 'game-fallback-6-h3', dealerSeatIndex: 2, winnerSeatIndex: 3 },
      { id: 'game-fallback-6-h4', dealerSeatIndex: 3, winnerSeatIndex: 0 },
    ] as const;

    let lastInserted: Awaited<ReturnType<typeof __testOnly_insertHandWithTx>> | null = null;
    for (const hand of hands) {
      lastInserted = await __testOnly_insertHandWithTx(
        createNormalInput({
          gameId: 'game-fallback-6',
          id: hand.id,
          dealerSeatIndex: hand.dealerSeatIndex,
          winnerSeatIndex: hand.winnerSeatIndex,
        }),
        executeTx,
      );
    }

    const expected = getRoundLabel(state.game.startingDealerSeatIndex, mapHandsForDealer(state)).labelZh;
    expect(expected).toBe('南風東局');
    expect(lastInserted?.nextRoundLabelZh).toBe(expected);
    expect(state.game.currentRoundLabelZh).toBe(expected);
  });

  it('throws guard error when game is ended', async () => {
    const state = createInitialState('game-fallback-ended');
    state.game.endedAt = Date.now();
    state.game.gameState = 'ended';
    const executeTx = buildExecuteTx(state);

    await expect(
      __testOnly_insertHandWithTx(createDrawInput('game-fallback-ended', '{}'), executeTx),
    ).rejects.toThrow('Cannot add hand to ended or abandoned game');
  });

  it('throws guard error when game is abandoned', async () => {
    const state = createInitialState('game-fallback-abandoned');
    state.game.gameState = 'abandoned';
    const executeTx = buildExecuteTx(state);

    await expect(
      __testOnly_insertHandWithTx(createDrawInput('game-fallback-abandoned', '{}'), executeTx),
    ).rejects.toThrow('Cannot add hand to ended or abandoned game');
  });
});
