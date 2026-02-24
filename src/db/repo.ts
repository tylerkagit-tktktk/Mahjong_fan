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
import { getRoundLabel } from '../models/dealer';
import {
  aggregatePlayerTotalsQByTimeline,
  getEffectivePlayerForSeat,
  normalizeSeatRotationOffset,
} from '../models/seatRotation';
import { executeSql, runWithWriteLock, withDb } from './sqlite';
import { dumpBreadcrumbs, setBreadcrumb } from '../debug/breadcrumbs';
import { isDev } from '../debug/isDev';
import { INITIAL_ROUND_LABEL_ZH } from '../constants/game';

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

function resolveDeltasQ(deltasJson?: string | null): number[] | null {
  if (!deltasJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(deltasJson) as
      | number[]
      | {
          values?: number[];
          deltasQ?: number[];
        };

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed.values)) {
      return parsed.values;
    }

    if (Array.isArray(parsed.deltasQ)) {
      return parsed.deltasQ;
    }
  } catch {
    return null;
  }

  return null;
}

function formatSignedMoney(value: number, symbol: string): string {
  const rounded = Math.round(value);
  if (rounded === 0) {
    return '0';
  }
  const sign = rounded > 0 ? '+' : '-';
  const abs = Math.abs(rounded);
  return `${sign}${symbol ?? ''}${abs}`;
}

type SqlParam = string | number | null;

type TxExecute = (statement: string, params?: SqlParam[]) => Promise<SQLite.ResultSet>;

const MUTABLE_GAME_STATES: ReadonlySet<string> = new Set(['draft', 'active']);
const MUTATION_BLOCKED_ERROR = 'Cannot mutate ended or abandoned game';
const INTERNAL_BACKUPS_KEY = 'db_internal_backups_v1';
const INTERNAL_BACKUPS_LIMIT = 5;
const INTERNAL_BACKUP_SCHEMA_VERSION = 1;
const INTERNAL_BACKUP_SCHEMA_COMPATIBILITY = new Set([INTERNAL_BACKUP_SCHEMA_VERSION]);
const MAX_PLAYER_NAME_LENGTH = 10;

type InternalBackup = {
  id: string;
  createdAt: number;
  trigger: 'insertHand' | 'endGame';
  schemaVersion: number;
  gameMeta: Array<{
    gameId: string;
    handsCount: number;
    gameState: string;
  }>;
  games: GameBundle[];
};

type BackupValidationReason = 'schema' | 'handsCount' | 'state' | 'deltas';
type BackupValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: BackupValidationReason;
    };

type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const inMemoryStorage = new Map<string, string>();

function getKeyValueStorage(): KeyValueStorage {
  try {
    const asyncStorage = require('@react-native-async-storage/async-storage').default as KeyValueStorage;
    if (asyncStorage && typeof asyncStorage.getItem === 'function' && typeof asyncStorage.setItem === 'function') {
      return asyncStorage;
    }
  } catch {
    // fall through to in-memory fallback for tests/non-native env.
  }
  return {
    async getItem(key: string) {
      return inMemoryStorage.has(key) ? inMemoryStorage.get(key)! : null;
    },
    async setItem(key: string, value: string) {
      inMemoryStorage.set(key, value);
    },
  };
}

function assertGameMutable(gameState: string | null | undefined, endedAt: number | null | undefined): void {
  if (endedAt != null || !MUTABLE_GAME_STATES.has(gameState ?? '')) {
    throw new Error(MUTATION_BLOCKED_ERROR);
  }
}

function truncatePlayerName(name: string | null | undefined): string {
  return String(name ?? '').slice(0, MAX_PLAYER_NAME_LENGTH);
}

export const __testOnly_mutationBlockedErrorMessage = MUTATION_BLOCKED_ERROR;

export function __testOnly_assertGameMutable(
  gameState: string | null | undefined,
  endedAt: number | null | undefined,
): void {
  assertGameMutable(gameState, endedAt);
}

function validateGameStateSnapshot(game: Game, handsCount: number): boolean {
  const state = game.gameState ?? 'draft';
  if (!['draft', 'active', 'ended', 'abandoned'].includes(state)) {
    return false;
  }
  if ((state === 'ended' || state === 'abandoned') && game.endedAt == null) {
    return false;
  }
  if ((state === 'draft' || state === 'active') && game.endedAt != null) {
    return false;
  }
  if (state === 'abandoned' && handsCount > 0) {
    return false;
  }
  return true;
}

export function __testOnly_validateBackupSnapshot(snapshot: InternalBackup): BackupValidationResult {
  if (!INTERNAL_BACKUP_SCHEMA_COMPATIBILITY.has(Number(snapshot.schemaVersion ?? -1))) {
    return { ok: false, reason: 'schema' };
  }
  for (const bundle of snapshot.games) {
    const handsCount = bundle.hands.length;
    const summary = snapshot.gameMeta?.find((entry) => entry.gameId === bundle.game.id);
    if (summary && summary.handsCount !== handsCount) {
      return { ok: false, reason: 'handsCount' };
    }
    if ((bundle.game.handsCount ?? handsCount) !== handsCount) {
      return { ok: false, reason: 'handsCount' };
    }
    if (!validateGameStateSnapshot(bundle.game, handsCount)) {
      return { ok: false, reason: 'state' };
    }
    for (const hand of bundle.hands) {
      const deltas = resolveDeltasQ(hand.deltasJson);
      if (!deltas || deltas.length === 0) {
        continue;
      }
      const sum = deltas.reduce((acc, value) => acc + Number(value ?? 0), 0);
      if (sum !== 0) {
        return { ok: false, reason: 'deltas' };
      }
    }
  }
  return { ok: true };
}

async function createInternalBackupSnapshot(trigger: 'insertHand' | 'endGame'): Promise<void> {
  const storage = getKeyValueStorage();
  const games = await listGames();
  if (games.length === 0) {
    return;
  }
  const bundles = await Promise.all(games.map((game) => getGameBundle(game.id)));
  const snapshot: InternalBackup = {
    id: `${trigger}-${Date.now()}`,
    createdAt: Date.now(),
    trigger,
    schemaVersion: INTERNAL_BACKUP_SCHEMA_VERSION,
    gameMeta: bundles.map((bundle) => ({
      gameId: bundle.game.id,
      handsCount: bundle.hands.length,
      gameState: bundle.game.gameState ?? 'draft',
    })),
    games: bundles,
  };
  const raw = await storage.getItem(INTERNAL_BACKUPS_KEY);
  let current: InternalBackup[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as InternalBackup[];
      if (Array.isArray(parsed)) {
        current = parsed;
      }
    } catch {
      current = [];
    }
  }
  const next = [snapshot, ...current].slice(0, INTERNAL_BACKUPS_LIMIT);
  await storage.setItem(INTERNAL_BACKUPS_KEY, JSON.stringify(next));
}

async function runExplicitWriteTransaction<T>(
  context: string,
  work: (executeTx: TxExecute) => Promise<T>,
): Promise<T> {
  return runWithWriteLock(async () =>
    withDb(async (db) => {
      const executeTx: TxExecute = async (statement, params = []) => {
        if (isDev) {
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
    if (isDev) {
      setBreadcrumb('Repo: createGameWithPlayers', { gameId: game.id, players: players.length });
    }
    const createdAt = game.createdAt ?? Date.now();

    await runExplicitWriteTransaction('createGameWithPlayers', async (executeTx) => {
      await __testOnly_createGameWithPlayersWithTx(
        {
          ...game,
          createdAt,
        },
        players,
        executeTx,
      );
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'createGameWithPlayers failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function __testOnly_createGameWithPlayersWithTx(
  game: NewGameInput,
  players: NewPlayerInput[],
  executeTx: TxExecute,
): Promise<void> {
  const persistedVariant = 'HK';
  await executeTx(
    `INSERT INTO games
     (id, title, createdAt, currencySymbol, variant, rulesJson, startingDealerSeatIndex, progressIndex, currentWindIndex, currentRoundNumber, maxWindIndex, seatRotationOffset, gameState, currentRoundLabelZh, languageOverride)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      game.id,
      game.title,
      game.createdAt ?? Date.now(),
      game.currencySymbol,
      persistedVariant,
      game.rulesJson,
      0,
      game.progressIndex ?? 0,
      game.currentWindIndex ?? 0,
      game.currentRoundNumber ?? 1,
      game.maxWindIndex ?? 1,
      0,
      'draft',
      INITIAL_ROUND_LABEL_ZH,
      game.languageOverride ?? null,
    ],
  );

  for (const player of players) {
    await executeTx('INSERT INTO players (id, gameId, name, seatIndex) VALUES (?, ?, ?, ?);', [
      player.id,
      player.gameId,
      truncatePlayerName(player.name),
      player.seatIndex,
    ]);
  }
}

export async function listGames(): Promise<Game[]> {
  try {
    if (isDev) {
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
    if (isDev) {
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
    if (isDev) {
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

export async function updateGameSeatRotationOffset(gameId: string, seatRotationOffset: number): Promise<void> {
  try {
    if (isDev) {
      setBreadcrumb('Repo: updateGameSeatRotationOffset', { gameId, seatRotationOffset });
    }
    await runExplicitWriteTransaction('updateGameSeatRotationOffset', async (executeTx) => {
      await __testOnly_applySeatRotationOffsetWithTx(gameId, seatRotationOffset, executeTx);
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'updateGameSeatRotationOffset failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function updateGamePlayerSeats(
  gameId: string,
  seatByPlayerId: Record<string, number>,
): Promise<void> {
  try {
    if (isDev) {
      setBreadcrumb('Repo: updateGamePlayerSeats', { gameId, seatByPlayerId });
    }
    await runExplicitWriteTransaction('updateGamePlayerSeats', async (executeTx) => {
      const gameResult = await executeTx('SELECT endedAt, gameState FROM games WHERE id = ? LIMIT 1;', [gameId]);
      if (gameResult.rows.length === 0) {
        throw new Error(`Game not found: ${gameId}`);
      }
      const gameRow = gameResult.rows.item(0) as {
        endedAt?: number | null;
        gameState?: string | null;
      };
      assertGameMutable(gameRow.gameState ?? null, gameRow.endedAt ?? null);

      const playersResult = await executeTx('SELECT id FROM players WHERE gameId = ? ORDER BY seatIndex ASC;', [gameId]);
      const playerRows = rowsToArray<{ id: string }>(playersResult);
      if (playerRows.length !== 4) {
        throw new Error('Invalid player count for reseat');
      }

      const playerIds = playerRows.map((row) => row.id);
      const providedIds = Object.keys(seatByPlayerId);
      if (providedIds.length !== playerIds.length || playerIds.some((id) => !Object.prototype.hasOwnProperty.call(seatByPlayerId, id))) {
        throw new Error('Invalid reseat payload');
      }

      const usedSeats = new Set<number>();
      for (const playerId of playerIds) {
        const seatIndex = Number(seatByPlayerId[playerId]);
        if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex > 3 || usedSeats.has(seatIndex)) {
          throw new Error('Invalid reseat payload');
        }
        usedSeats.add(seatIndex);
      }

      for (const playerId of playerIds) {
        await executeTx('UPDATE players SET seatIndex = ? WHERE id = ? AND gameId = ?;', [
          seatByPlayerId[playerId],
          playerId,
          gameId,
        ]);
      }

      await executeTx('UPDATE games SET seatRotationOffset = 0 WHERE id = ?;', [gameId]);
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'updateGamePlayerSeats failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function __testOnly_applySeatRotationOffsetWithTx(
  gameId: string,
  seatRotationOffset: number,
  executeTx: TxExecute,
): Promise<void> {
  const gameResult = await executeTx('SELECT endedAt, gameState, seatRotationOffset FROM games WHERE id = ? LIMIT 1;', [gameId]);
  if (gameResult.rows.length === 0) {
    throw new Error(`Game not found: ${gameId}`);
  }
  const gameRow = gameResult.rows.item(0) as {
    endedAt?: number | null;
    gameState?: string | null;
    seatRotationOffset?: number | null;
  };
  assertGameMutable(gameRow.gameState ?? null, gameRow.endedAt ?? null);
  const nextOffset = normalizeSeatRotationOffset(seatRotationOffset);
  const currentOffset = normalizeSeatRotationOffset(Number(gameRow.seatRotationOffset ?? 0));
  if (currentOffset === nextOffset) {
    return;
  }
  await executeTx('UPDATE games SET seatRotationOffset = ? WHERE id = ?;', [
    nextOffset,
    gameId,
  ]);
}

export async function __testOnly_insertHandWithTx(
  handInput: NewHandInput,
  executeTx: TxExecute,
): Promise<Hand> {
  const gameResult = await executeTx(
    'SELECT endedAt, gameState, startingDealerSeatIndex, currentWindIndex, currentRoundNumber, currentRoundLabelZh, seatRotationOffset FROM games WHERE id = ? LIMIT 1;',
    [handInput.gameId],
  );
  if (gameResult.rows.length === 0) {
    throw new Error(`Game not found: ${handInput.gameId}`);
  }
  const gameRow = gameResult.rows.item(0) as {
    endedAt?: number | null;
    gameState?: string | null;
    startingDealerSeatIndex?: number | null;
    currentWindIndex?: number | null;
    currentRoundNumber?: number | null;
    currentRoundLabelZh?: string | null;
    seatRotationOffset?: number | null;
  };
  const gameEndedAt = gameRow.endedAt ?? null;
  const gameState = gameRow.gameState ?? 'draft';
  assertGameMutable(gameState, gameEndedAt);
  const startingDealerSeatIndex = Number(gameRow.startingDealerSeatIndex ?? 0);
  const currentWindIndex = Number(gameRow.currentWindIndex ?? 0);
  const currentRoundNumber = Number(gameRow.currentRoundNumber ?? 1);
  const seatRotationOffset = normalizeSeatRotationOffset(Number(gameRow.seatRotationOffset ?? 0));
  const playersResult = await executeTx('SELECT * FROM players WHERE gameId = ? ORDER BY seatIndex ASC;', [
    handInput.gameId,
  ]);
  const players = rowsToArray<Player>(playersResult);
  const winnerPlayer =
    handInput.winnerSeatIndex == null
      ? null
      : getEffectivePlayerForSeat(players, seatRotationOffset, handInput.winnerSeatIndex);
  const discarderPlayer =
    handInput.discarderSeatIndex == null
      ? null
      : getEffectivePlayerForSeat(players, seatRotationOffset, handInput.discarderSeatIndex);

  if (handInput.winnerSeatIndex != null && !winnerPlayer) {
    throw new Error(`Winner player not found for seat ${handInput.winnerSeatIndex}`);
  }
  if (handInput.discarderSeatIndex != null && !discarderPlayer) {
    throw new Error(`Discarder player not found for seat ${handInput.discarderSeatIndex}`);
  }

  const maxResult = await executeTx('SELECT MAX(handIndex) as maxIndex FROM hands WHERE gameId = ?;', [
    handInput.gameId,
  ]);
  const maxIndexRow = maxResult.rows.item(0) as { maxIndex: number | null };
  const nextIndex = (maxIndexRow.maxIndex ?? -1) + 1;
  const createdAt = handInput.createdAt ?? Date.now();

  let computedJson = handInput.computedJson;
  let drawDealerAction: 'stick' | 'pass' | null = null;
  if (handInput.isDraw) {
    let parsed: Record<string, unknown> = {};
    if (computedJson) {
      try {
        const maybeObject = JSON.parse(computedJson) as unknown;
        if (maybeObject && typeof maybeObject === 'object' && !Array.isArray(maybeObject)) {
          parsed = maybeObject as Record<string, unknown>;
        }
      } catch {
        parsed = {};
      }
    }

    const rawDealerAction = parsed.dealerAction;
    drawDealerAction = rawDealerAction === 'pass' || rawDealerAction === 'stick' ? rawDealerAction : 'stick';
    parsed.dealerAction = drawDealerAction;
    computedJson = JSON.stringify(parsed);
  }

  await executeTx(
    `INSERT INTO hands (id, gameId, handIndex, dealerSeatIndex, windIndex, roundNumber, isDraw, winnerSeatIndex, type, winnerPlayerId, discarderPlayerId, inputValue, deltasJson, computedJson, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      handInput.id,
      handInput.gameId,
      nextIndex,
      handInput.dealerSeatIndex,
      currentWindIndex,
      currentRoundNumber,
      handInput.isDraw ? 1 : 0,
      handInput.winnerSeatIndex ?? null,
      handInput.type,
      winnerPlayer?.id ?? handInput.winnerPlayerId ?? null,
      discarderPlayer?.id ?? handInput.discarderPlayerId ?? null,
      handInput.inputValue ?? null,
      handInput.deltasJson ?? null,
      computedJson,
      createdAt,
    ],
  );

  const nextGameState = gameState === 'draft' ? 'active' : gameState;

  const handsResult = await executeTx('SELECT * FROM hands WHERE gameId = ? ORDER BY handIndex ASC;', [
    handInput.gameId,
  ]);
  const hands = normalizeHands(handsResult);
  const computedNextLabelZh = getRoundLabel(startingDealerSeatIndex, hands).labelZh;
  const nextRoundLabelZh = computedNextLabelZh;
  const nextSeatRotationOffset = seatRotationOffset;

  await executeTx('UPDATE hands SET nextRoundLabelZh = ? WHERE id = ?;', [nextRoundLabelZh, handInput.id]);

  await executeTx(
    `UPDATE games
     SET handsCount = COALESCE(handsCount, 0) + 1,
         currentRoundLabelZh = ?,
         seatRotationOffset = ?,
         gameState = ?
     WHERE id = ?;`,
    [nextRoundLabelZh, nextSeatRotationOffset, nextGameState, handInput.gameId],
  );

  if (isDev) {
    const handsAfterUpdateResult = await executeTx('SELECT * FROM hands WHERE gameId = ? ORDER BY handIndex ASC;', [
      handInput.gameId,
    ]);
    const handsAfterUpdate = normalizeHands(handsAfterUpdateResult);
    const expectedNextLabelZh = getRoundLabel(startingDealerSeatIndex, handsAfterUpdate).labelZh;

    const gameLabelResult = await executeTx(
      'SELECT currentRoundLabelZh FROM games WHERE id = ? LIMIT 1;',
      [handInput.gameId],
    );
    const dbLabelZh =
      gameLabelResult.rows.length > 0
        ? ((gameLabelResult.rows.item(0) as { currentRoundLabelZh?: string | null }).currentRoundLabelZh ?? null)
        : null;

    if (expectedNextLabelZh !== computedNextLabelZh || dbLabelZh !== expectedNextLabelZh) {
      const sanityPayload = {
        gameId: handInput.gameId,
        lastHandId: handInput.id,
        handIndex: nextIndex,
        isDraw: Boolean(handInput.isDraw),
        dealerAction: drawDealerAction,
        winnerSeatIndex: handInput.winnerSeatIndex ?? null,
        startingDealerSeatIndex,
        expectedNextLabelZh,
        computedNextLabelZh,
        dbLabelZh,
      };
      setBreadcrumb('Repo: insertHand roundLabel mismatch', sanityPayload);
      console.warn('[Repo] round label mismatch after insertHand', sanityPayload);
    }
  }

  const insertedHand: Hand = {
    id: handInput.id,
    gameId: handInput.gameId,
    handIndex: nextIndex,
    dealerSeatIndex: handInput.dealerSeatIndex,
    windIndex: currentWindIndex,
    roundNumber: currentRoundNumber,
    isDraw: Boolean(handInput.isDraw),
    winnerSeatIndex: handInput.winnerSeatIndex ?? null,
    type: handInput.type,
    winnerPlayerId: winnerPlayer?.id ?? handInput.winnerPlayerId ?? null,
    discarderPlayerId: discarderPlayer?.id ?? handInput.discarderPlayerId ?? null,
    inputValue: handInput.inputValue ?? null,
    deltasJson: handInput.deltasJson ?? null,
    nextRoundLabelZh,
    computedJson,
    createdAt,
  };

  return insertedHand;
}

export async function insertHand(handInput: NewHandInput): Promise<Hand> {
  try {
    if (isDev) {
      setBreadcrumb('Repo: insertHand', { gameId: handInput.gameId });
    }

    const hand = await runExplicitWriteTransaction('insertHand', async (executeTx) =>
      __testOnly_insertHandWithTx(handInput, executeTx),
    );
    createInternalBackupSnapshot('insertHand').catch((error) => {
      if (isDev) {
        console.warn('[DB] internal backup after insertHand failed', error);
      }
    });
    return hand;
  } catch (error) {
    const wrapped = normalizeError(error, 'insertHand failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function deleteGameCascade(gameId: string): Promise<void> {
  try {
    if (isDev) {
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
    if (isDev) {
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

export async function deleteAllGames(): Promise<void> {
  try {
    if (isDev) {
      setBreadcrumb('Repo: deleteAllGames');
    }

    await runExplicitWriteTransaction('deleteAllGames', async (executeTx) => {
      await executeTx('DELETE FROM hands;');
      await executeTx('DELETE FROM players;');

      // Backward compatibility: older builds may use game_players naming.
      const gamePlayersTable = await executeTx(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_players' LIMIT 1;",
      );
      if (gamePlayersTable.rows.length > 0) {
        await executeTx('DELETE FROM game_players;');
      }

      await executeTx('DELETE FROM games;');
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'deleteAllGames failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function restoreLastBackup(): Promise<{
  restored: boolean;
  reason?: BackupValidationReason | 'missing';
}> {
  if (!isDev) {
    return { restored: false, reason: 'missing' };
  }
  const storage = getKeyValueStorage();
  const raw = await storage.getItem(INTERNAL_BACKUPS_KEY);
  if (!raw) {
    return { restored: false, reason: 'missing' };
  }
  let backups: InternalBackup[] = [];
  try {
    const parsed = JSON.parse(raw) as InternalBackup[];
    backups = Array.isArray(parsed) ? parsed : [];
  } catch {
    backups = [];
  }
  if (backups.length === 0) {
    return { restored: false, reason: 'missing' };
  }
  const latest = backups[0];
  const validation = __testOnly_validateBackupSnapshot(latest);
  if (!validation.ok) {
    return { restored: false, reason: validation.reason };
  }
  await runExplicitWriteTransaction('restoreLastBackup', async (executeTx) => {
    await executeTx('DELETE FROM hands;');
    await executeTx('DELETE FROM players;');
    await executeTx('DELETE FROM games;');

    for (const bundle of latest.games) {
      const game = bundle.game;
      await executeTx(
        `INSERT INTO games
         (id, title, createdAt, endedAt, currencySymbol, variant, rulesJson, startingDealerSeatIndex, handsCount, resultStatus, resultSummaryJson, resultUpdatedAt, progressIndex, currentWindIndex, currentRoundNumber, maxWindIndex, seatRotationOffset, gameState, currentRoundLabelZh, languageOverride)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          game.id,
          game.title,
          game.createdAt,
          game.endedAt ?? null,
          game.currencySymbol,
          game.variant,
          game.rulesJson,
          game.startingDealerSeatIndex,
          game.handsCount ?? bundle.hands.length,
          game.resultStatus ?? null,
          game.resultSummaryJson ?? null,
          game.resultUpdatedAt ?? null,
          game.progressIndex ?? 0,
          game.currentWindIndex ?? 0,
          game.currentRoundNumber ?? 1,
          game.maxWindIndex ?? 1,
          normalizeSeatRotationOffset(game.seatRotationOffset ?? 0),
          game.gameState ?? 'draft',
          game.currentRoundLabelZh ?? INITIAL_ROUND_LABEL_ZH,
          game.languageOverride ?? null,
        ],
      );
      for (const player of bundle.players) {
        await executeTx('INSERT INTO players (id, gameId, name, seatIndex) VALUES (?, ?, ?, ?);', [
          player.id,
          player.gameId,
          truncatePlayerName(player.name),
          player.seatIndex,
        ]);
      }
      for (const hand of bundle.hands) {
        await executeTx(
          `INSERT INTO hands
           (id, gameId, handIndex, dealerSeatIndex, windIndex, roundNumber, isDraw, winnerSeatIndex, type, winnerPlayerId, discarderPlayerId, inputValue, deltasJson, computedJson, nextRoundLabelZh, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            hand.id,
            hand.gameId,
            hand.handIndex,
            hand.dealerSeatIndex,
            hand.windIndex ?? 0,
            hand.roundNumber ?? 1,
            hand.isDraw ? 1 : 0,
            hand.winnerSeatIndex ?? null,
            hand.type,
            hand.winnerPlayerId ?? null,
            hand.discarderPlayerId ?? null,
            hand.inputValue ?? null,
            hand.deltasJson ?? null,
            hand.computedJson ?? null,
            hand.nextRoundLabelZh ?? null,
            hand.createdAt,
          ],
        );
      }
    }
  });
  return { restored: true };
}

function buildDemoId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDemoPlayers(gameId: string): NewPlayerInput[] {
  const names = ['東家阿明', '南家阿華', '西家阿強', '北家阿玲'];
  return names.map((name, seatIndex) => ({
    id: buildDemoId(`demo-player-${seatIndex}`),
    gameId,
    name,
    seatIndex,
  }));
}

function buildDemoHandInput(params: {
  gameId: string;
  dealerSeatIndex?: number;
  isDraw?: boolean;
  type?: string;
  winnerSeatIndex?: number | null;
  winnerPlayerId?: string | null;
  discarderPlayerId?: string | null;
  deltasJson?: string | null;
  computedJson?: string;
  createdAt: number;
}): NewHandInput {
  return {
    id: buildDemoId('demo-hand'),
    gameId: params.gameId,
    dealerSeatIndex: params.dealerSeatIndex ?? 0,
    isDraw: params.isDraw ?? false,
    winnerSeatIndex: params.winnerSeatIndex ?? (params.winnerPlayerId ? 0 : null),
    type: params.type ?? 'discard',
    winnerPlayerId: params.winnerPlayerId ?? null,
    discarderPlayerId: params.discarderPlayerId ?? null,
    inputValue: 0,
    deltasJson: params.deltasJson ?? null,
    computedJson: params.computedJson ?? JSON.stringify({ source: 'seedDemo' }),
    createdAt: params.createdAt,
  };
}

export async function seedDemoGames(): Promise<void> {
  if (!isDev) {
    return;
  }

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  // Case 1: 進行中（有手、未結束、無結果快照）
  const activeGameId = buildDemoId('demo-active');
  const activeCreatedAt = now - oneDay * 2;
  const activePlayers = buildDemoPlayers(activeGameId);
  await createGameWithPlayers(
    {
      id: activeGameId,
      title: 'Demo 進行中',
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 0,
      createdAt: activeCreatedAt,
    },
    activePlayers,
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeGameId,
      dealerSeatIndex: 0,
      winnerSeatIndex: 1,
      winnerPlayerId: activePlayers[1].id,
      discarderPlayerId: activePlayers[1].id,
      deltasJson: JSON.stringify([40, -20, -10, -10]),
      createdAt: activeCreatedAt + 5 * 60 * 1000,
    }),
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeGameId,
      dealerSeatIndex: 1,
      winnerSeatIndex: 2,
      winnerPlayerId: activePlayers[2].id,
      discarderPlayerId: activePlayers[2].id,
      deltasJson: JSON.stringify([-10, 40, -20, -10]),
      createdAt: activeCreatedAt + 10 * 60 * 1000,
    }),
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeGameId,
      dealerSeatIndex: 2,
      winnerSeatIndex: 3,
      winnerPlayerId: activePlayers[3].id,
      discarderPlayerId: activePlayers[3].id,
      deltasJson: JSON.stringify([-10, -10, 30, -10]),
      createdAt: activeCreatedAt + 15 * 60 * 1000,
    }),
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeGameId,
      dealerSeatIndex: 3,
      winnerSeatIndex: 0,
      winnerPlayerId: activePlayers[0].id,
      discarderPlayerId: activePlayers[0].id,
      deltasJson: JSON.stringify([30, -10, -10, -10]),
      createdAt: activeCreatedAt + 20 * 60 * 1000,
    }),
  );
  await runExplicitWriteTransaction('seedDemoGames-active-null-result', async (executeTx) => {
    await executeTx(
      `UPDATE games
       SET resultStatus = NULL,
           resultSummaryJson = NULL,
           resultUpdatedAt = ?
       WHERE id = ?;`,
      [activeCreatedAt + 6 * 60 * 1000, activeGameId],
    );
  });

  // Case 2: 已結束（有結果）
  const endedWithResultId = buildDemoId('demo-ended-result');
  const endedWithResultCreatedAt = now - oneDay * 10;
  const endedWithResultPlayers = buildDemoPlayers(endedWithResultId);
  await createGameWithPlayers(
    {
      id: endedWithResultId,
      title: 'Demo 已結束',
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 0,
      createdAt: endedWithResultCreatedAt,
    },
    endedWithResultPlayers,
  );
  await insertHand(
    buildDemoHandInput({
      gameId: endedWithResultId,
      winnerPlayerId: endedWithResultPlayers[2].id,
      discarderPlayerId: endedWithResultPlayers[0].id,
      deltasJson: JSON.stringify({ values: [-16, -8, 32, -8] }),
      createdAt: endedWithResultCreatedAt + 8 * 60 * 1000,
    }),
  );
  await endGame(endedWithResultId, endedWithResultCreatedAt + 70 * 60 * 1000);
  await updateGameResultSnapshot(endedWithResultId);

  // Case 3: 已結束（未有結果）- 有手但 summary 刻意留空
  const endedNoResultId = buildDemoId('demo-ended-no-result');
  const endedNoResultCreatedAt = now - oneDay * 20;
  const endedNoResultPlayers = buildDemoPlayers(endedNoResultId);
  await createGameWithPlayers(
    {
      id: endedNoResultId,
      title: 'Demo 已結束',
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 0,
      createdAt: endedNoResultCreatedAt,
    },
    endedNoResultPlayers,
  );
  await insertHand(
    buildDemoHandInput({
      gameId: endedNoResultId,
      winnerPlayerId: endedNoResultPlayers[1].id,
      discarderPlayerId: endedNoResultPlayers[3].id,
      deltasJson: 'not-json',
      createdAt: endedNoResultCreatedAt + 6 * 60 * 1000,
    }),
  );
  await runExplicitWriteTransaction('seedDemoGames-end-no-result', async (executeTx) => {
    await executeTx(
      `UPDATE games
       SET endedAt = ?,
           resultStatus = NULL,
           resultSummaryJson = NULL,
           resultUpdatedAt = ?
       WHERE id = ?;`,
      [endedNoResultCreatedAt + 80 * 60 * 1000, now, endedNoResultId],
    );
  });

  // Case 4: 已放棄（ended + 0 hands）
  const abandonedGameId = buildDemoId('demo-abandoned');
  const abandonedCreatedAt = now - oneDay * 5;
  await createGameWithPlayers(
    {
      id: abandonedGameId,
      title: 'Demo 已放棄',
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 0,
      createdAt: abandonedCreatedAt,
    },
    buildDemoPlayers(abandonedGameId),
  );
  await endGame(abandonedGameId, abandonedCreatedAt + 10 * 60 * 1000);

  if (isDev) {
    setBreadcrumb('Repo: seedDemoGames done', {
      gameIds: [activeGameId, endedWithResultId, endedNoResultId, abandonedGameId].join(','),
    });
  }
}

export async function seedDemoGamesWithProgress(): Promise<void> {
  if (!isDev) {
    return;
  }

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  // Case A: 進行中（真局風推進 + 流局 pass/stick）
  const activeId = buildDemoId('demo-progress-active');
  const activeCreatedAt = now - oneDay * 2;
  const activePlayers = buildDemoPlayers(activeId);
  await createGameWithPlayers(
    {
      id: activeId,
      title: 'Demo 進行中',
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 0,
      createdAt: activeCreatedAt,
    },
    activePlayers,
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeId,
      winnerPlayerId: activePlayers[0].id,
      discarderPlayerId: activePlayers[1].id,
      deltasJson: JSON.stringify([20, -10, -5, -5]),
      createdAt: activeCreatedAt + 5 * 60 * 1000,
    }),
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeId,
      dealerSeatIndex: 1,
      winnerSeatIndex: 2,
      winnerPlayerId: activePlayers[1].id,
      discarderPlayerId: activePlayers[2].id,
      deltasJson: JSON.stringify([-10, 30, -10, -10]),
      createdAt: activeCreatedAt + 10 * 60 * 1000,
    }),
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeId,
      dealerSeatIndex: 2,
      winnerSeatIndex: 3,
      winnerPlayerId: activePlayers[2].id,
      discarderPlayerId: activePlayers[3].id,
      deltasJson: JSON.stringify([-10, -10, 30, -10]),
      createdAt: activeCreatedAt + 15 * 60 * 1000,
    }),
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeId,
      dealerSeatIndex: 3,
      winnerSeatIndex: 0,
      winnerPlayerId: activePlayers[3].id,
      discarderPlayerId: activePlayers[0].id,
      deltasJson: JSON.stringify([-10, -10, -10, 30]),
      createdAt: activeCreatedAt + 20 * 60 * 1000,
    }),
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeId,
      dealerSeatIndex: 0,
      winnerSeatIndex: null,
      winnerPlayerId: null,
      discarderPlayerId: null,
      isDraw: true,
      type: 'draw',
      computedJson: JSON.stringify({ source: 'seedDemo', dealerAction: 'stick' }),
      deltasJson: null,
      createdAt: activeCreatedAt + 25 * 60 * 1000,
    }),
  );
  await insertHand(
    buildDemoHandInput({
      gameId: activeId,
      dealerSeatIndex: 0,
      winnerSeatIndex: null,
      winnerPlayerId: null,
      discarderPlayerId: null,
      isDraw: true,
      type: 'draw',
      computedJson: JSON.stringify({ source: 'seedDemo', dealerAction: 'pass' }),
      deltasJson: null,
      createdAt: activeCreatedAt + 30 * 60 * 1000,
    }),
  );

  // Case B: 已結束 + 有結果
  const endedResultId = buildDemoId('demo-progress-ended-result');
  const endedResultCreatedAt = now - oneDay * 10;
  const endedResultPlayers = buildDemoPlayers(endedResultId);
  await createGameWithPlayers(
    {
      id: endedResultId,
      title: 'Demo 已結束',
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 0,
      createdAt: endedResultCreatedAt,
    },
    endedResultPlayers,
  );
  await insertHand(
    buildDemoHandInput({
      gameId: endedResultId,
      winnerPlayerId: endedResultPlayers[2].id,
      discarderPlayerId: endedResultPlayers[0].id,
      deltasJson: JSON.stringify({ values: [-16, -8, 32, -8] }),
      createdAt: endedResultCreatedAt + 8 * 60 * 1000,
    }),
  );
  await endGame(endedResultId, endedResultCreatedAt + 70 * 60 * 1000);
  await updateGameResultSnapshot(endedResultId);

  // Case C: 已結束 + 無結果
  const endedNoResultId = buildDemoId('demo-progress-ended-no-result');
  const endedNoResultCreatedAt = now - oneDay * 20;
  const endedNoResultPlayers = buildDemoPlayers(endedNoResultId);
  await createGameWithPlayers(
    {
      id: endedNoResultId,
      title: 'Demo 已結束',
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 0,
      createdAt: endedNoResultCreatedAt,
    },
    endedNoResultPlayers,
  );
  await insertHand(
    buildDemoHandInput({
      gameId: endedNoResultId,
      winnerPlayerId: endedNoResultPlayers[1].id,
      discarderPlayerId: endedNoResultPlayers[3].id,
      deltasJson: 'not-json',
      createdAt: endedNoResultCreatedAt + 6 * 60 * 1000,
    }),
  );
  await runExplicitWriteTransaction('seedDemoGamesWithProgress-ended-no-result', async (executeTx) => {
    await executeTx(
      `UPDATE games
       SET endedAt = ?,
           resultStatus = NULL,
           resultSummaryJson = NULL,
           resultUpdatedAt = ?
       WHERE id = ?;`,
      [endedNoResultCreatedAt + 80 * 60 * 1000, now, endedNoResultId],
    );
  });

  // Case D: 已放棄
  const abandonedId = buildDemoId('demo-progress-abandoned');
  const abandonedCreatedAt = now - oneDay * 5;
  await createGameWithPlayers(
    {
      id: abandonedId,
      title: 'Demo 已放棄',
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: '{}',
      startingDealerSeatIndex: 0,
      createdAt: abandonedCreatedAt,
    },
    buildDemoPlayers(abandonedId),
  );
  await endGame(abandonedId, abandonedCreatedAt + 10 * 60 * 1000);

  if (isDev) {
    setBreadcrumb('Repo: seedDemoGamesWithProgress done', {
      gameIds: [activeId, endedResultId, endedNoResultId, abandonedId].join(','),
    });
  }
}

export async function endGame(gameId: string, endedAt: number = Date.now()): Promise<void> {
  try {
    if (isDev) {
      setBreadcrumb('Repo: endGame', { gameId, endedAt });
    }
    await runExplicitWriteTransaction('endGame', async (executeTx) => {
      await __testOnly_endGameWithTx(gameId, endedAt, executeTx);
    });
    const bundle = await getGameBundle(gameId);
    if (bundle.game.gameState === 'ended') {
      await updateGameResultSnapshot(gameId);
    }
    createInternalBackupSnapshot('endGame').catch((error) => {
      if (isDev) {
        console.warn('[DB] internal backup after endGame failed', error);
      }
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'endGame failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

export async function __testOnly_endGameWithTx(
  gameId: string,
  endedAt: number,
  executeTx: TxExecute,
): Promise<void> {
  const gameResult = await executeTx(
    'SELECT COALESCE(handsCount, 0) AS handsCount, endedAt, gameState FROM games WHERE id = ? LIMIT 1;',
    [
      gameId,
    ],
  );
  if (gameResult.rows.length === 0) {
    throw new Error(`Game not found: ${gameId}`);
  }
  const gameRow = gameResult.rows.item(0) as {
    handsCount: number;
    endedAt?: number | null;
    gameState?: string | null;
  };
  assertGameMutable(gameRow.gameState ?? null, gameRow.endedAt ?? null);
  const normalizedHandsCount = Number(gameRow.handsCount ?? 0);
  const nextState = normalizedHandsCount === 0 ? 'abandoned' : 'ended';
  const nextResultStatus = normalizedHandsCount === 0 ? 'abandoned' : 'none';
  await executeTx(
    `UPDATE games
     SET endedAt = ?,
         gameState = ?,
         resultStatus = ?,
         resultSummaryJson = NULL,
         resultUpdatedAt = ?
     WHERE id = ?;`,
    [endedAt, nextState, nextResultStatus, endedAt, gameId],
  );
}

export async function updateGameResultSnapshot(gameId: string): Promise<void> {
  try {
    if (isDev) {
      setBreadcrumb('Repo: updateGameResultSnapshot', { gameId });
    }

    const bundle = await getGameBundle(gameId);
    if (bundle.game.gameState !== 'ended') {
      throw new Error(`updateGameResultSnapshot only allowed for ended games: ${gameId}`);
    }
    const handsCount = bundle.hands.length;
    const now = Date.now();

    if (handsCount === 0) {
      await runExplicitWriteTransaction('updateGameResultSnapshot-empty', async (executeTx) => {
        await executeTx(
          `UPDATE games
           SET handsCount = ?,
               resultStatus = ?,
               resultSummaryJson = NULL,
               resultUpdatedAt = ?
           WHERE id = ?;`,
          [0, 'abandoned', now, gameId],
        );
      });
      return;
    }

    const orderedHands = bundle.hands.slice().sort((a, b) => a.handIndex - b.handIndex);
    const seatTotalsQ: number[] = [0, 0, 0, 0];
    orderedHands.forEach((hand) => {
      const deltasQ = resolveDeltasQ(hand.deltasJson);
      if (!deltasQ) {
        return;
      }
      for (let i = 0; i < Math.min(4, deltasQ.length); i += 1) {
        seatTotalsQ[i] += Number(deltasQ[i] ?? 0);
      }
    });
    const playerTotalsQ = aggregatePlayerTotalsQByTimeline(
      bundle.players,
      orderedHands.map((hand) => ({
        nextRoundLabelZh: hand.nextRoundLabelZh ?? null,
        deltasQ: resolveDeltasQ(hand.deltasJson),
      })),
      INITIAL_ROUND_LABEL_ZH,
      0,
    );

    let winnerPlayer = bundle.players[0] ?? null;
    let loserPlayer = bundle.players[0] ?? null;
    bundle.players.forEach((player) => {
      if (!winnerPlayer || (playerTotalsQ.get(player.id) ?? 0) > (playerTotalsQ.get(winnerPlayer.id) ?? 0)) {
        winnerPlayer = player;
      }
      if (!loserPlayer || (playerTotalsQ.get(player.id) ?? 0) < (playerTotalsQ.get(loserPlayer.id) ?? 0)) {
        loserPlayer = player;
      }
    });

    const symbol = bundle.game.currencySymbol ?? '';
    const winnerName = winnerPlayer?.name ?? '—';
    const loserName = loserPlayer?.name ?? '—';
    const winnerMoney = winnerPlayer ? (playerTotalsQ.get(winnerPlayer.id) ?? 0) / 4 : 0;
    const loserMoney = loserPlayer ? (playerTotalsQ.get(loserPlayer.id) ?? 0) / 4 : 0;
    const summaryJson = JSON.stringify({
      winnerText: `${winnerName} ${formatSignedMoney(winnerMoney, symbol)}`,
      loserText: `${loserName} ${formatSignedMoney(loserMoney, symbol)}`,
      seatTotalsQ,
      playerTotalsQ: bundle.players.reduce<Record<string, number>>((acc, player) => {
        acc[player.id] = playerTotalsQ.get(player.id) ?? 0;
        return acc;
      }, {}),
      playersCount: bundle.players.length,
    });

    await runExplicitWriteTransaction('updateGameResultSnapshot', async (executeTx) => {
      await executeTx(
        `UPDATE games
         SET handsCount = ?,
             resultStatus = ?,
             resultSummaryJson = ?,
             resultUpdatedAt = ?
         WHERE id = ?;`,
        [handsCount, 'result', summaryJson, now, gameId],
      );
    });
  } catch (error) {
    const wrapped = normalizeError(error, 'updateGameResultSnapshot failed');
    console.error('[DB]', wrapped);
    throw wrapped;
  }
}

function normalizeError(error: unknown, context: string): Error {
  if (error instanceof Error) {
    return error;
  }
  if (!error && isDev) {
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
