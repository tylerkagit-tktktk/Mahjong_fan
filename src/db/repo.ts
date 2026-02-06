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
import { executeSql, runInTransaction } from './sqlite';

function rowsToArray<T>(result: SQLite.ResultSet): T[] {
  const items: T[] = [];
  for (let i = 0; i < result.rows.length; i += 1) {
    items.push(result.rows.item(i) as T);
  }
  return items;
}

export async function createGameWithPlayers(
  game: NewGameInput,
  players: NewPlayerInput[],
): Promise<void> {
  try {
    await runInTransaction(async (tx) => {
      const createdAt = game.createdAt ?? Date.now();
      await tx.executeSql(
        'INSERT INTO games (id, title, createdAt, currencySymbol, variant, rulesJson, languageOverride) VALUES (?, ?, ?, ?, ?, ?, ?);',
        [
          game.id,
          game.title,
          createdAt,
          game.currencySymbol,
          game.variant,
          game.rulesJson,
          game.languageOverride ?? null,
        ],
      );

      for (const player of players) {
        await tx.executeSql(
          'INSERT INTO players (id, gameId, name, seatIndex) VALUES (?, ?, ?, ?);',
          [player.id, player.gameId, player.name, player.seatIndex],
        );
      }
    });
  } catch (error) {
    console.error('[DB] createGameWithPlayers failed', error);
    throw error;
  }
}

export async function listGames(): Promise<Game[]> {
  try {
    const result = await executeSql('SELECT * FROM games ORDER BY createdAt DESC;');
    return rowsToArray<Game>(result);
  } catch (error) {
    console.error('[DB] listGames failed', error);
    throw error;
  }
}

export async function getGameBundle(gameId: string): Promise<GameBundle> {
  try {
    const gameResult = await executeSql('SELECT * FROM games WHERE id = ? LIMIT 1;', [gameId]);
    const games = rowsToArray<Game>(gameResult);
    if (games.length === 0) {
      throw new Error(`Game not found: ${gameId}`);
    }

    const playersResult = await executeSql('SELECT * FROM players WHERE gameId = ? ORDER BY seatIndex ASC;', [
      gameId,
    ]);
    const handsResult = await executeSql(
      'SELECT * FROM hands WHERE gameId = ? ORDER BY handIndex ASC;',
      [gameId],
    );

    return {
      game: games[0],
      players: rowsToArray<Player>(playersResult),
      hands: rowsToArray<Hand>(handsResult),
    };
  } catch (error) {
    console.error('[DB] getGameBundle failed', error);
    throw error;
  }
}

export async function insertHand(handInput: NewHandInput): Promise<Hand> {
  try {
    return await runInTransaction(async (tx) => {
      const maxResult = await tx.executeSql(
        'SELECT MAX(handIndex) as maxIndex FROM hands WHERE gameId = ?;',
        [handInput.gameId],
      );
      const maxIndexRow = maxResult[0].rows.item(0) as { maxIndex: number | null };
      const nextIndex = (maxIndexRow.maxIndex ?? -1) + 1;
      const createdAt = handInput.createdAt ?? Date.now();

      await tx.executeSql(
        `INSERT INTO hands (id, gameId, handIndex, type, winnerPlayerId, discarderPlayerId, inputValue, computedJson, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          handInput.id,
          handInput.gameId,
          nextIndex,
          handInput.type,
          handInput.winnerPlayerId ?? null,
          handInput.discarderPlayerId ?? null,
          handInput.inputValue ?? null,
          handInput.computedJson,
          createdAt,
        ],
      );

      return {
        id: handInput.id,
        gameId: handInput.gameId,
        handIndex: nextIndex,
        type: handInput.type,
        winnerPlayerId: handInput.winnerPlayerId ?? null,
        discarderPlayerId: handInput.discarderPlayerId ?? null,
        inputValue: handInput.inputValue ?? null,
        computedJson: handInput.computedJson,
        createdAt,
      };
    });
  } catch (error) {
    console.error('[DB] insertHand failed', error);
    throw error;
  }
}

export async function deleteGameCascade(gameId: string): Promise<void> {
  try {
    await runInTransaction(async (tx) => {
      await tx.executeSql('DELETE FROM hands WHERE gameId = ?;', [gameId]);
      await tx.executeSql('DELETE FROM players WHERE gameId = ?;', [gameId]);
      await tx.executeSql('DELETE FROM games WHERE id = ?;', [gameId]);
    });
  } catch (error) {
    console.error('[DB] deleteGameCascade failed', error);
    throw error;
  }
}

export async function wipeAllData(): Promise<void> {
  try {
    await runInTransaction(async (tx) => {
      await tx.executeSql('DELETE FROM hands;');
      await tx.executeSql('DELETE FROM players;');
      await tx.executeSql('DELETE FROM games;');
    });
  } catch (error) {
    console.error('[DB] wipeAllData failed', error);
    throw error;
  }
}
