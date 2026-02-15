import { NewHandInput, Hand } from '../models/db';
import { aggregatePlayerTotalsQByTimeline } from '../models/seatRotation';
import {
  __testOnly_applySeatRotationOffsetWithTx,
  __testOnly_endGameWithTx,
  __testOnly_insertHandWithTx,
} from './repo';

type MockGameRow = {
  id: string;
  endedAt: number | null;
  gameState: 'draft' | 'active' | 'ended' | 'abandoned';
  startingDealerSeatIndex: number;
  currentWindIndex: number;
  currentRoundNumber: number;
  handsCount: number;
  currentRoundLabelZh: string | null;
  seatRotationOffset: number;
  resultStatus: 'none' | 'result' | 'abandoned' | null;
};

type TxState = {
  game: MockGameRow;
  players: Array<{ id: string; gameId: string; name: string; seatIndex: number }>;
  hands: Hand[];
  seatOffsetUpdateCount: number;
};

type RowSet<T> = {
  rows: {
    length: number;
    item: (index: number) => T;
  };
};

function createRowSet<T>(items: T[]): RowSet<T> {
  return {
    rows: {
      length: items.length,
      item: (index: number) => items[index],
    },
  };
}

function createState(gameId: string): TxState {
  const players = [0, 1, 2, 3].map((seat) => ({
    id: `${gameId}-p${seat}`,
    gameId,
    name: `P${seat}`,
    seatIndex: seat,
  }));
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
      seatRotationOffset: 0,
      resultStatus: null,
    },
    players,
    hands: [],
    seatOffsetUpdateCount: 0,
  };
}

function buildExecuteTx(state: TxState) {
  return async (statement: string, params: Array<string | number | null> = []) => {
    if (statement.startsWith('SELECT endedAt, gameState, startingDealerSeatIndex')) {
      return createRowSet([state.game]);
    }
    if (statement.startsWith('SELECT endedAt, gameState, seatRotationOffset FROM games WHERE id = ? LIMIT 1;')) {
      return createRowSet([
        {
          endedAt: state.game.endedAt,
          gameState: state.game.gameState,
          seatRotationOffset: state.game.seatRotationOffset,
        },
      ]);
    }
    if (statement.startsWith('SELECT * FROM players WHERE gameId = ? ORDER BY seatIndex ASC;')) {
      return createRowSet(state.players.filter((player) => player.gameId === String(params[0])));
    }
    if (statement.startsWith('SELECT MAX(handIndex) as maxIndex FROM hands')) {
      const gameId = String(params[0]);
      const matching = state.hands.filter((hand) => hand.gameId === gameId);
      const maxIndex = matching.length > 0 ? Math.max(...matching.map((hand) => hand.handIndex)) : null;
      return createRowSet([{ maxIndex }]);
    }
    if (statement.startsWith('INSERT INTO hands')) {
      const inserted: Hand = {
        id: String(params[0]),
        gameId: String(params[1]),
        handIndex: Number(params[2]),
        dealerSeatIndex: Number(params[3]),
        windIndex: Number(params[4]),
        roundNumber: Number(params[5]),
        isDraw: Number(params[6]) === 1,
        winnerSeatIndex: params[7] == null ? null : Number(params[7]),
        type: String(params[8]),
        winnerPlayerId: params[9] == null ? null : String(params[9]),
        discarderPlayerId: params[10] == null ? null : String(params[10]),
        inputValue: params[11] == null ? null : Number(params[11]),
        deltasJson: params[12] == null ? null : String(params[12]),
        nextRoundLabelZh: null,
        computedJson: params[13] == null ? '{}' : String(params[13]),
        createdAt: Number(params[14]),
      };
      state.hands.push(inserted);
      return createRowSet([]);
    }
    if (statement.startsWith('SELECT * FROM hands WHERE gameId = ? ORDER BY handIndex ASC;')) {
      const gameId = String(params[0]);
      return createRowSet(
        state.hands.filter((hand) => hand.gameId === gameId).sort((a, b) => a.handIndex - b.handIndex),
      );
    }
    if (statement.startsWith('UPDATE hands SET nextRoundLabelZh = ? WHERE id = ?;')) {
      const label = params[0] == null ? null : String(params[0]);
      const handId = String(params[1]);
      const hand = state.hands.find((entry) => entry.id === handId);
      if (hand) {
        hand.nextRoundLabelZh = label;
      }
      return createRowSet([]);
    }
    if (statement.includes('SET handsCount = COALESCE(handsCount, 0) + 1,')) {
      state.game.handsCount += 1;
      state.game.currentRoundLabelZh = params[0] == null ? null : String(params[0]);
      state.game.seatRotationOffset = Number(params[1] ?? state.game.seatRotationOffset);
      state.game.gameState = String(params[2]) as MockGameRow['gameState'];
      return createRowSet([]);
    }
    if (statement.startsWith('SELECT currentRoundLabelZh FROM games WHERE id = ? LIMIT 1;')) {
      return createRowSet([{ currentRoundLabelZh: state.game.currentRoundLabelZh }]);
    }
    if (statement.startsWith('UPDATE games SET seatRotationOffset = ? WHERE id = ?;')) {
      state.game.seatRotationOffset = Number(params[0] ?? state.game.seatRotationOffset);
      state.seatOffsetUpdateCount += 1;
      return createRowSet([]);
    }
    if (statement.startsWith('SELECT COALESCE(handsCount, 0) AS handsCount, endedAt, gameState FROM games WHERE id = ? LIMIT 1;')) {
      return createRowSet([
        {
          handsCount: state.game.handsCount,
          endedAt: state.game.endedAt,
          gameState: state.game.gameState,
        },
      ]);
    }
    if (statement.includes('SET endedAt = ?,')) {
      state.game.endedAt = Number(params[0] ?? Date.now());
      state.game.gameState = String(params[1]) as MockGameRow['gameState'];
      state.game.resultStatus = (params[2] as MockGameRow['resultStatus']) ?? null;
      return createRowSet([]);
    }

    throw new Error(`Unhandled SQL statement in lifecycle test: ${statement}`);
  };
}

function createHandInput(args: {
  gameId: string;
  id: string;
  dealerSeatIndex: number;
  winnerSeatIndex: number | null;
  discarderSeatIndex: number | null;
  isDraw?: boolean;
  type?: string;
  computedJson?: string;
  deltasJson?: string | null;
}): NewHandInput {
  return {
    id: args.id,
    gameId: args.gameId,
    dealerSeatIndex: args.dealerSeatIndex,
    isDraw: Boolean(args.isDraw),
    winnerSeatIndex: args.winnerSeatIndex,
    discarderSeatIndex: args.discarderSeatIndex,
    type: args.type ?? (args.isDraw ? 'draw' : 'discard'),
    winnerPlayerId: null,
    discarderPlayerId: null,
    inputValue: 0,
    deltasJson: args.deltasJson ?? JSON.stringify([10, -4, -3, -3]),
    computedJson: args.computedJson ?? JSON.stringify({ source: 'test' }),
    createdAt: 1_700_000_000_000,
  };
}

describe('repo lifecycle with reseat decision', () => {
  it('wrap does not auto-rotate and no-reseat keeps mapping stable', async () => {
    const state = createState('lifecycle-no-reseat');
    state.game.currentRoundLabelZh = '北風北局';
    state.hands = Array.from({ length: 15 }).map((_, index) => ({
      id: `seed-${index + 1}`,
      gameId: state.game.id,
      handIndex: index,
      dealerSeatIndex: index % 4,
      windIndex: 0,
      roundNumber: 1,
      isDraw: false,
      winnerSeatIndex: (index + 1) % 4,
      type: 'discard',
      winnerPlayerId: state.players[(index + 1) % 4].id,
      discarderPlayerId: state.players[index % 4].id,
      inputValue: 0,
      deltasJson: JSON.stringify([10, -4, -3, -3]),
      nextRoundLabelZh: null,
      computedJson: JSON.stringify({ source: 'seed' }),
      createdAt: Date.now() - (15 - index) * 1000,
    }));
    state.game.handsCount = state.hands.length;

    const executeTx = buildExecuteTx(state);

    const wrappedHand = await __testOnly_insertHandWithTx(
      createHandInput({
        gameId: state.game.id,
        id: 'wrap-hand',
        dealerSeatIndex: 3,
        winnerSeatIndex: 0,
        discarderSeatIndex: 3,
      }),
      executeTx,
    );

    expect(wrappedHand.nextRoundLabelZh).toBe('東風東局');
    expect(state.game.seatRotationOffset).toBe(0);

    const nextHand = await __testOnly_insertHandWithTx(
      createHandInput({
        gameId: state.game.id,
        id: 'post-wrap-no-reseat',
        dealerSeatIndex: 0,
        winnerSeatIndex: 0,
        discarderSeatIndex: 1,
      }),
      executeTx,
    );

    expect(nextHand.winnerPlayerId).toBe(state.players[0].id);
    expect(nextHand.discarderPlayerId).toBe(state.players[1].id);
  });

  it('reseat apply updates mapping for subsequent hands and game can end', async () => {
    const state = createState('lifecycle-reseat');
    const executeTx = buildExecuteTx(state);

    const first = await __testOnly_insertHandWithTx(
      createHandInput({
        gameId: state.game.id,
        id: 'hand-before-reseat',
        dealerSeatIndex: 0,
        winnerSeatIndex: 0,
        discarderSeatIndex: 1,
      }),
      executeTx,
    );
    expect(first.winnerPlayerId).toBe(state.players[0].id);

    await __testOnly_applySeatRotationOffsetWithTx(state.game.id, 1, executeTx);
    expect(state.game.seatRotationOffset).toBe(1);

    const second = await __testOnly_insertHandWithTx(
      createHandInput({
        gameId: state.game.id,
        id: 'hand-after-reseat',
        dealerSeatIndex: 1,
        winnerSeatIndex: 0,
        discarderSeatIndex: 1,
      }),
      executeTx,
    );

    expect(second.winnerPlayerId).toBe(state.players[3].id);
    expect(second.discarderPlayerId).toBe(state.players[0].id);

    await __testOnly_endGameWithTx(state.game.id, Date.now(), executeTx);
    expect(state.game.gameState).toBe('ended');
    expect(state.game.endedAt).not.toBeNull();
    expect(state.game.currentRoundLabelZh).toBeTruthy();
  });

  it('keeps pre-reseat aggregation stable and only remaps post-reseat hands', async () => {
    const state = createState('lifecycle-regression');
    state.game.currentRoundLabelZh = '北風北局';
    state.hands = Array.from({ length: 15 }).map((_, index) => ({
      id: `preseed-${index + 1}`,
      gameId: state.game.id,
      handIndex: index,
      dealerSeatIndex: index % 4,
      windIndex: 0,
      roundNumber: 1,
      isDraw: false,
      winnerSeatIndex: (index + 1) % 4,
      type: 'discard',
      winnerPlayerId: state.players[(index + 1) % 4].id,
      discarderPlayerId: state.players[index % 4].id,
      inputValue: 0,
      deltasJson: JSON.stringify([40, -20, -10, -10]),
      nextRoundLabelZh: null,
      computedJson: JSON.stringify({ source: 'seed' }),
      createdAt: 1_700_000_000_000 + index * 1000,
    }));
    state.game.handsCount = state.hands.length;
    const executeTx = buildExecuteTx(state);

    await __testOnly_insertHandWithTx(
      {
        ...createHandInput({
          gameId: state.game.id,
          id: 'wrap-hand',
          dealerSeatIndex: 3,
          winnerSeatIndex: 0,
          discarderSeatIndex: 3,
          deltasJson: JSON.stringify([40, -20, -10, -10]),
        }),
        createdAt: 1_700_000_020_000,
      },
      executeTx,
    );

    expect(state.game.currentRoundLabelZh).toBe('東風東局');
    expect(state.game.seatRotationOffset).toBe(0);

    const baselineBeforeReseat = aggregatePlayerTotalsQByTimeline(
      state.players,
      state.hands
        .filter((hand) => hand.handIndex <= 15)
        .map((hand) => ({
          nextRoundLabelZh: hand.nextRoundLabelZh,
          deltasQ: hand.deltasJson ? (JSON.parse(hand.deltasJson) as number[]) : null,
        })),
      '東風東局',
      0,
    );
    const baselineSumQ = Array.from(baselineBeforeReseat.values()).reduce((sum, value) => sum + value, 0);
    expect(baselineSumQ).toBe(0);

    await __testOnly_applySeatRotationOffsetWithTx(state.game.id, 1, executeTx);
    expect(state.game.seatRotationOffset).toBe(1);

    const postHand1 = await __testOnly_insertHandWithTx(
      {
        ...createHandInput({
          gameId: state.game.id,
          id: 'post-hand-1',
          dealerSeatIndex: 0,
          winnerSeatIndex: 0,
          discarderSeatIndex: 1,
          deltasJson: JSON.stringify([20, -20, 0, 0]),
        }),
        createdAt: 1_700_000_021_000,
      },
      executeTx,
    );
    const postHand2 = await __testOnly_insertHandWithTx(
      {
        ...createHandInput({
          gameId: state.game.id,
          id: 'post-hand-2',
          dealerSeatIndex: 1,
          winnerSeatIndex: 2,
          discarderSeatIndex: 3,
          deltasJson: JSON.stringify([0, 0, 24, -24]),
        }),
        createdAt: 1_700_000_022_000,
      },
      executeTx,
    );

    expect(postHand1.winnerPlayerId).toBe(state.players[3].id);
    expect(postHand1.discarderPlayerId).toBe(state.players[0].id);
    expect(postHand2.winnerPlayerId).toBe(state.players[1].id);
    expect(postHand2.discarderPlayerId).toBe(state.players[2].id);

    const totalsBeforeFromTimeline = aggregatePlayerTotalsQByTimeline(
      state.players,
      state.hands
        .filter((hand) => hand.handIndex <= 15)
        .map((hand) => ({
          nextRoundLabelZh: hand.nextRoundLabelZh,
          deltasQ: hand.deltasJson ? (JSON.parse(hand.deltasJson) as number[]) : null,
        })),
      '東風東局',
      0,
    );
    const totalsBeforeWithCurrentOffset = aggregatePlayerTotalsQByTimeline(
      state.players,
      state.hands
        .filter((hand) => hand.handIndex <= 15)
        .map((hand) => ({
          nextRoundLabelZh: hand.nextRoundLabelZh,
          deltasQ: hand.deltasJson ? (JSON.parse(hand.deltasJson) as number[]) : null,
        })),
      '東風東局',
      state.game.seatRotationOffset,
    );
    state.players.forEach((player) => {
      expect(totalsBeforeFromTimeline.get(player.id)).toBe(baselineBeforeReseat.get(player.id));
    });
    expect(totalsBeforeWithCurrentOffset.get(state.players[0].id)).not.toBe(
      baselineBeforeReseat.get(state.players[0].id),
    );

    const totalsAllFromTimeline = aggregatePlayerTotalsQByTimeline(
      state.players,
      state.hands.map((hand) => ({
        nextRoundLabelZh: hand.nextRoundLabelZh,
        deltasQ: hand.deltasJson ? (JSON.parse(hand.deltasJson) as number[]) : null,
      })),
      '東風東局',
      0,
    );
    const sumAllQ = Array.from(totalsAllFromTimeline.values()).reduce((sum, value) => sum + value, 0);
    expect(sumAllQ).toBe(0);
  });

  it('blocks reseat apply and endGame when game is already ended', async () => {
    const state = createState('lifecycle-guard-ended');
    state.game.endedAt = 1_700_000_100_000;
    state.game.gameState = 'ended';
    const executeTx = buildExecuteTx(state);

    await expect(__testOnly_applySeatRotationOffsetWithTx(state.game.id, 1, executeTx)).rejects.toThrow(
      'Cannot mutate ended or abandoned game',
    );
    await expect(__testOnly_endGameWithTx(state.game.id, 1_700_000_200_000, executeTx)).rejects.toThrow(
      'Cannot mutate ended or abandoned game',
    );
  });

  it('treats reseat apply with same offset as no-op', async () => {
    const state = createState('lifecycle-reseat-noop');
    state.game.seatRotationOffset = 2;
    const executeTx = buildExecuteTx(state);

    await __testOnly_applySeatRotationOffsetWithTx(state.game.id, 2, executeTx);

    expect(state.game.seatRotationOffset).toBe(2);
    expect(state.seatOffsetUpdateCount).toBe(0);
  });
});
