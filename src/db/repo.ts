// @ts-ignore
import SQLite from 'react-native-sqlite-storage';
import {
  Game,
  GameBundle,
  Hand,
  NewGameInput,
  NewHandInput,
  NewPlayerInput,
  Player,
} from '../models/db';
import { executeSql, runWithWriteLock, withDb } from './sqlite';
import { dumpBreadcrumbs, setBreadcrumb } from '../debug/breadcrumbs';

function rowsToArray<T>(result: SQLite.ResultSet): T[] {
  const items: T[] = [];
  for (let i = 0; i < result.rows.length; i += 1) {
    items.push(result.rows.item(i) as T);
  }
  return items;
}

function normalizeHands(result: SQLite.ResultSet): Hand[] {
  const items = rowsToArray<
    Omit<Hand, 'isDraw'> & {
      isDraw: number | boolean;
    }
  >(result);

  return items.map((hand) => ({
    ...hand,
    isDraw: Boolean(hand.isDraw),
  }));
}

type SqlParam = string | number | null;

type TxExecute = (statement: string, params?: SqlParam[]) => Promise<SQLite.ResultSet>;

async function runExplicitWriteTransaction<T>(
  context: string,
  work: (executeTx: TxExecute) => Promise<T>,
): Promise<T> {
  return runWithWriteLock(async () =>
    withDb(async (db) => {
      const executeTx: TxExecute = async (statement, params = []) => {
        if (__DEV__) {
          setBreadcrumb('SQL tx', { statement, params });
        }
        try {
          const [result] = await db.executeSql(statement, params);
          return result;
        } catch (error) {
          throw normalizeError(error, `${context} sql failed`);
        }
      };

      // Acquire write lock up front; avoids lock escalation timing races.
      await executeTx('BEGIN IMMEDIATE;');
      try {
        const value = await work(executeTx);
        await executeTx('COMMIT;');
        return value;
      } catch (error) {
        try {
          await executeTx('ROLLBACK;');
        } catch (rollbackError) {
          console.error('[DB] rollback failed', normalizeError(rollbackError, `${context} rollback failed`));
        }
        throw normalizeError(error, `${context} transaction failed`);
      }
    }),
  );
}

export async function createGameWithPlayers(
  game: NewGameInput,
  players: NewPlayerInput[],
): Promise<void> {
  try {
    if (__DEV__) {
      setBreadcrumb('Repo: createGameWithPlayers', { gameId: game.id, players: players.length });
    }
    const createdAt = game.createdAt ?? Date.now();

    await runExplicitWriteTransaction('createGameWithPlayers', async (executeTx) => {
      await executeTx(
        'INSERT INTO games (id, title, createdAt, currencySymbol, variant, rulesJson, startingDealerSeatIndex, languageOverride) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
        [
          game.id,
          game.title,
          createdAt,
          game.currencySymbol,
          game.variant,
          game.rulesJson,
          game.startingDealerSeatIndex ?? 0,
          game.languageOverride ?? null,
        ],
      );

      for (const player of players) {
        await executeTx('INSERT INTO players (id, gameId, name, seatIndex) VALUES (?, ?, ?, ?);', [
          player.id,
          player.gameId,
          player.name,
          player.seatIndex,
        ]);
      }
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'createGameWithPlayers failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function listGames(): Promise<Game[]> {
  try {
    if (__DEV__) {
      setBreadcrumb('Repo: listGames');
    }
    const result = await executeSql('SELECT * FROM games ORDER BY createdAt DESC;');
    return rowsToArray<Game>(result);
  } catch (error) {
    const wrapped = normalizeError(error, 'listGames failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function getGameBundle(gameId: string): Promise<GameBundle> {
  try {
    if (__DEV__) {
      setBreadcrumb('Repo: getGameBundle', { gameId });
    }
    const gameResult = await executeSql('SELECT * FROM games WHERE id = ? LIMIT 1;', [gameId]);
    const games = rowsToArray<Game>(gameResult);
    if (games.length === 0) {
      throw new Error(`Game not found: ${gameId}`);
    }

    const playersResult = await executeSql('SELECT * FROM players WHERE gameId = ? ORDER BY seatIndex ASC;', [
      gameId,
    ]);
    const handsResult = await executeSql('SELECT * FROM hands WHERE gameId = ? ORDER BY handIndex ASC;', [
      gameId,
    ]);

    return {
      game: games[0],
      players: rowsToArray<Player>(playersResult),
      hands: normalizeHands(handsResult),
    };
  } catch (error) {
    const wrapped = normalizeError(error, 'getGameBundle failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function getHandsCount(gameId: string): Promise<number> {
  try {
    if (__DEV__) {
      setBreadcrumb('Repo: getHandsCount', { gameId });
    }
    const result = await executeSql('SELECT COUNT(*) as count FROM hands WHERE gameId = ?;', [gameId]);
    const row = result.rows.item(0) as { count: number };
    return row?.count ?? 0;
  } catch (error) {
    const wrapped = normalizeError(error, 'getHandsCount failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function insertHand(handInput: NewHandInput): Promise<Hand> {
  try {
    if (__DEV__) {
      setBreadcrumb('Repo: insertHand', { gameId: handInput.gameId });
    }

    return await runExplicitWriteTransaction('insertHand', async (executeTx) => {
      const maxResult = await executeTx('SELECT MAX(handIndex) as maxIndex FROM hands WHERE gameId = ?;', [
        handInput.gameId,
      ]);
      const maxIndexRow = maxResult.rows.item(0) as { maxIndex: number | null };
      const nextIndex = (maxIndexRow.maxIndex ?? -1) + 1;
      const createdAt = handInput.createdAt ?? Date.now();

      await executeTx(
        `INSERT INTO hands (id, gameId, handIndex, dealerSeatIndex, isDraw, winnerSeatIndex, type, winnerPlayerId, discarderPlayerId, inputValue, deltasJson, computedJson, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          handInput.id,
          handInput.gameId,
          nextIndex,
          handInput.dealerSeatIndex,
          handInput.isDraw ? 1 : 0,
          handInput.winnerSeatIndex ?? null,
          handInput.type,
          handInput.winnerPlayerId ?? null,
          handInput.discarderPlayerId ?? null,
          handInput.inputValue ?? null,
          handInput.deltasJson ?? null,
          handInput.computedJson,
          createdAt,
        ],
      );

      return {
        id: handInput.id,
        gameId: handInput.gameId,
        handIndex: nextIndex,
        dealerSeatIndex: handInput.dealerSeatIndex,
        isDraw: Boolean(handInput.isDraw),
        winnerSeatIndex: handInput.winnerSeatIndex ?? null,
        type: handInput.type,
        winnerPlayerId: handInput.winnerPlayerId ?? null,
        discarderPlayerId: handInput.discarderPlayerId ?? null,
        inputValue: handInput.inputValue ?? null,
        deltasJson: handInput.deltasJson ?? null,
        computedJson: handInput.computedJson,
        createdAt,
      };
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'insertHand failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function deleteGameCascade(gameId: string): Promise<void> {
  try {
    if (__DEV__) {
      setBreadcrumb('Repo: deleteGameCascade', { gameId });
    }

    await runExplicitWriteTransaction('deleteGameCascade', async (executeTx) => {
      await executeTx('DELETE FROM hands WHERE gameId = ?;', [gameId]);
      await executeTx('DELETE FROM players WHERE gameId = ?;', [gameId]);
      await executeTx('DELETE FROM games WHERE id = ?;', [gameId]);
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'deleteGameCascade failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function wipeAllData(): Promise<void> {
  try {
    if (__DEV__) {
      setBreadcrumb('Repo: wipeAllData');
    }

    await runExplicitWriteTransaction('wipeAllData', async (executeTx) => {
      await executeTx('DELETE FROM hands;');
      await executeTx('DELETE FROM players;');
      await executeTx('DELETE FROM games;');
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'wipeAllData failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function endGame(gameId: string, endedAt: number = Date.now()): Promise<void> {
  try {
    if (__DEV__) {
      setBreadcrumb('Repo: endGame', { gameId, endedAt });
    }
    await runExplicitWriteTransaction('endGame', async (executeTx) => {
      await executeTx('UPDATE games SET endedAt = ? WHERE id = ?;', [endedAt, gameId]);
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'endGame failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

function normalizeError(error: unknown, context: string): Error {
  if (error instanceof Error) {
    return error;
  }
  if (!error && __DEV__) {
    const bug = new Error('[BUG] falsy rejection');
    (bug as { breadcrumbs?: unknown }).breadcrumbs = dumpBreadcrumbs(10);
    console.error('[DB] falsy error in', context, dumpBreadcrumbs(10));
    return bug;
  }
  const message = error ? String(error) : `[DB] unknown error in ${context}`;
  const wrapped = new Error(message);
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}
