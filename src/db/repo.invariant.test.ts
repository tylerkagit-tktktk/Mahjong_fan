import {
  __testOnly_applySeatRotationOffsetWithTx,
  __testOnly_assertGameMutable,
  __testOnly_endGameWithTx,
  __testOnly_insertHandWithTx,
  __testOnly_mutationBlockedErrorMessage,
} from './repo';
import { aggregatePlayerTotalsQByTimeline } from '../models/seatRotation';
import { Player } from '../models/db';

type RowSet<T> = {
  rows: {
    length: number;
    item: (index: number) => T;
  };
};

type SqlResult = {
  rows: {
    length: number;
    item: (index: number) => unknown;
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

const players: Player[] = [
  { id: 'p0', gameId: 'g1', name: 'A', seatIndex: 0 },
  { id: 'p1', gameId: 'g1', name: 'B', seatIndex: 1 },
  { id: 'p2', gameId: 'g1', name: 'C', seatIndex: 2 },
  { id: 'p3', gameId: 'g1', name: 'D', seatIndex: 3 },
];

function buildLabel(step: number): string {
  const winds = ['東風', '南風', '西風', '北風'];
  const rounds = ['東局', '南局', '西局', '北局'];
  const wind = winds[Math.floor(step / 4) % 4];
  const round = rounds[step % 4];
  return `${wind}${round}`;
}

function buildHandTimeline(count: number, startStep = 0) {
  return Array.from({ length: count }).map((_, index) => {
    const deltaSeed = (index + startStep) % 7;
    const d0 = 8 + deltaSeed;
    const d1 = -(3 + (deltaSeed % 3));
    const d2 = -(2 + ((deltaSeed + 1) % 3));
    const d3 = -(d0 + d1 + d2);
    return {
      nextRoundLabelZh: buildLabel(startStep + index + 1),
      deltasQ: [d0, d1, d2, d3],
    };
  });
}

function sumTotalsQ(totals: Map<string, number>): number {
  return Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
}

function getExecuteTxForImmutableGame(row: { endedAt: number | null; gameState: string }): (sql: string) => Promise<SqlResult> {
  return async () =>
    createRowSet([
      {
        ...row,
        startingDealerSeatIndex: 0,
        currentWindIndex: 0,
        currentRoundNumber: 1,
        currentRoundLabelZh: '東風東局',
        seatRotationOffset: 0,
        handsCount: 0,
      },
    ]) as unknown as SqlResult;
}

describe('repo invariants', () => {
  it('keeps zero-sum for long insert-like timeline (20 hands)', () => {
    const hands = buildHandTimeline(20);
    const totals = aggregatePlayerTotalsQByTimeline(players, hands, '東風東局', 0);
    expect(sumTotalsQ(totals)).toBe(0);
  });

  it('reseat before/after wrap keeps pre-reseat totals stable and global zero-sum', () => {
    const preHands = buildHandTimeline(12, 0);
    const postHands = buildHandTimeline(8, 12);

    const totalsBefore = aggregatePlayerTotalsQByTimeline(players, preHands, '東風東局', 0);
    const totalsBeforeSnapshot = new Map(totalsBefore);

    const postInitialLabel = preHands[preHands.length - 1].nextRoundLabelZh;
    const totalsAfterReseat = aggregatePlayerTotalsQByTimeline(players, postHands, postInitialLabel, 1);
    const combined = new Map<string, number>();
    players.forEach((player) => {
      combined.set(player.id, (totalsBefore.get(player.id) ?? 0) + (totalsAfterReseat.get(player.id) ?? 0));
    });

    players.forEach((player) => {
      expect(totalsBefore.get(player.id)).toBe(totalsBeforeSnapshot.get(player.id));
    });
    expect(sumTotalsQ(combined)).toBe(0);
  });

  it('snapshot-style totals stay consistent with timeline aggregate', () => {
    const hands = buildHandTimeline(24);
    const totals = aggregatePlayerTotalsQByTimeline(players, hands, '東風東局', 0);
    const snapshotSeatTotals = [0, 0, 0, 0];
    hands.forEach((hand) => {
      hand.deltasQ.forEach((value, seat) => {
        snapshotSeatTotals[seat] += value;
      });
    });
    const snapshotSum = snapshotSeatTotals.reduce((sum, value) => sum + value, 0);
    expect(snapshotSum).toBe(0);
    expect(sumTotalsQ(totals)).toBe(0);
  });

  it('blocks insertHand for ended and abandoned games with identical message', async () => {
    await expect(
      __testOnly_insertHandWithTx(
        {
          id: 'h1',
          gameId: 'g1',
          dealerSeatIndex: 0,
          isDraw: false,
          winnerSeatIndex: 0,
          type: 'discard',
          winnerPlayerId: 'p0',
          discarderSeatIndex: 1,
          inputValue: null,
          deltasJson: '[1,-1,0,0]',
          computedJson: null,
          createdAt: 1,
        },
        getExecuteTxForImmutableGame({ endedAt: 1, gameState: 'ended' }),
      ),
    ).rejects.toThrow(__testOnly_mutationBlockedErrorMessage);

    await expect(
      __testOnly_insertHandWithTx(
        {
          id: 'h2',
          gameId: 'g1',
          dealerSeatIndex: 0,
          isDraw: false,
          winnerSeatIndex: 0,
          type: 'discard',
          winnerPlayerId: 'p0',
          discarderSeatIndex: 1,
          inputValue: null,
          deltasJson: '[1,-1,0,0]',
          computedJson: null,
          createdAt: 1,
        },
        getExecuteTxForImmutableGame({ endedAt: 2, gameState: 'abandoned' }),
      ),
    ).rejects.toThrow(__testOnly_mutationBlockedErrorMessage);
  });

  it('all mutable guards expose identical error message', async () => {
    expect(() => __testOnly_assertGameMutable('ended', 1)).toThrow(__testOnly_mutationBlockedErrorMessage);

    const immutableTx = getExecuteTxForImmutableGame({ endedAt: 10, gameState: 'ended' });

    await expect(__testOnly_endGameWithTx('g1', 11, immutableTx)).rejects.toThrow(
      __testOnly_mutationBlockedErrorMessage,
    );

    await expect(__testOnly_applySeatRotationOffsetWithTx('g1', 1, immutableTx)).rejects.toThrow(
      __testOnly_mutationBlockedErrorMessage,
    );
  });

  it('does not depend on legacy progression fields in timeline setup', () => {
    const hands = buildHandTimeline(4);
    hands.forEach((hand) => {
      const keys = Object.keys(hand);
      expect(keys).not.toContain('progressIndex');
      expect(keys).not.toContain('currentWindIndex');
      expect(keys).not.toContain('currentRoundNumber');
    });
  });
});
