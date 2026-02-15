import { __testOnly_validateBackupSnapshot } from './repo';

function createSnapshot() {
  return {
    id: 'backup-1',
    createdAt: 1_700_000_000_000,
    trigger: 'endGame' as const,
    schemaVersion: 1,
    gameMeta: [{ gameId: 'g1', handsCount: 1, gameState: 'ended' }],
    games: [
      {
        game: {
          id: 'g1',
          title: 'Demo',
          createdAt: 1_700_000_000_000,
          endedAt: 1_700_000_360_000,
          currencySymbol: 'HK$',
          variant: 'HK',
          rulesJson: '{}',
          startingDealerSeatIndex: 0,
          handsCount: 1,
          resultStatus: 'result',
          resultSummaryJson: null,
          resultUpdatedAt: null,
          progressIndex: 0,
          currentWindIndex: 0,
          currentRoundNumber: 1,
          maxWindIndex: 1,
          seatRotationOffset: 0,
          gameState: 'ended',
          currentRoundLabelZh: '東風東局',
          languageOverride: null,
        },
        players: [
          { id: 'p1', gameId: 'g1', name: 'A', seatIndex: 0 },
          { id: 'p2', gameId: 'g1', name: 'B', seatIndex: 1 },
          { id: 'p3', gameId: 'g1', name: 'C', seatIndex: 2 },
          { id: 'p4', gameId: 'g1', name: 'D', seatIndex: 3 },
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
            type: 'discard',
            winnerPlayerId: 'p1',
            discarderPlayerId: 'p2',
            inputValue: null,
            deltasJson: JSON.stringify([10, -5, -3, -2]),
            computedJson: null,
            nextRoundLabelZh: '東風南局',
            createdAt: 1_700_000_100_000,
          },
        ],
      },
    ],
  };
}

describe('backup snapshot validation', () => {
  it('fails when metadata hands count mismatches', () => {
    const snapshot = createSnapshot();
    snapshot.gameMeta[0].handsCount = 2;
    const result = __testOnly_validateBackupSnapshot(snapshot as never);
    expect(result).toEqual({ ok: false, reason: 'handsCount' });
  });

  it('passes with valid snapshot payload', () => {
    const snapshot = createSnapshot();
    const result = __testOnly_validateBackupSnapshot(snapshot as never);
    expect(result).toEqual({ ok: true });
  });
});
