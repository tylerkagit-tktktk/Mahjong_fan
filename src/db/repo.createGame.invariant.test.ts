import { __testOnly_createGameWithPlayersWithTx } from './repo';
import { NewGameInput, NewPlayerInput } from '../models/db';
import { getRoundLabel } from '../models/dealer';
import { INITIAL_ROUND_LABEL_ZH } from '../constants/game';

type CapturedInsert = {
  statement: string;
  params: Array<string | number | null>;
};

describe('createGameWithPlayers invariant', () => {
  it('always starts at 東風東局 with 東位為莊 and no seat rotation', async () => {
    const captured: CapturedInsert[] = [];
    const executeTx = jest.fn(async (statement: string, params: Array<string | number | null> = []) => {
      captured.push({ statement, params });
      return {
        rows: {
          length: 0,
          item: () => ({}),
        },
      };
    });

    const game: NewGameInput = {
      id: 'g-invariant',
      title: 'Invariant',
      createdAt: 1_735_689_600_000,
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 3,
      seatRotationOffset: 2,
      currentRoundLabelZh: '北風北局',
    };
    const players: NewPlayerInput[] = [0, 1, 2, 3].map((seat) => ({
      id: `p${seat}`,
      gameId: game.id,
      name: `P${seat}`,
      seatIndex: seat,
    }));

    await __testOnly_createGameWithPlayersWithTx(game, players, executeTx as any);

    const gameInsert = captured.find((entry) => entry.statement.includes('INSERT INTO games'));
    expect(gameInsert).toBeTruthy();
    const params = gameInsert?.params ?? [];
    expect(params[6]).toBe(0);
    expect(params[11]).toBe(0);
    expect(params[13]).toBe(INITIAL_ROUND_LABEL_ZH);
    expect(getRoundLabel(0, []).labelZh).toBe(INITIAL_ROUND_LABEL_ZH);
  });
});
