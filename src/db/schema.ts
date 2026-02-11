// @ts-ignore
import SQLite from 'react-native-sqlite-storage';

const TABLES = [
  `CREATE TABLE IF NOT EXISTS games(
    id TEXT PRIMARY KEY,
    title TEXT,
    createdAt INTEGER,
    currencySymbol TEXT,
    variant TEXT,
    rulesJson TEXT,
    startingDealerSeatIndex INTEGER NOT NULL DEFAULT 0,
    languageOverride TEXT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS players(
    id TEXT PRIMARY KEY,
    gameId TEXT,
    name TEXT,
    seatIndex INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS hands(
    id TEXT PRIMARY KEY,
    gameId TEXT,
    handIndex INTEGER,
    dealerSeatIndex INTEGER NOT NULL DEFAULT 0,
    isDraw INTEGER NOT NULL DEFAULT 0,
    winnerSeatIndex INTEGER NULL,
    type TEXT,
    winnerPlayerId TEXT NULL,
    discarderPlayerId TEXT NULL,
    inputValue REAL NULL,
    deltasJson TEXT NULL,
    computedJson TEXT,
    createdAt INTEGER
  );`,
];

const INDICES = [
  'CREATE INDEX IF NOT EXISTS idx_hands_game_handIndex ON hands(gameId, handIndex);',
  'CREATE INDEX IF NOT EXISTS idx_games_createdAt ON games(createdAt);',
  'CREATE INDEX IF NOT EXISTS idx_players_game ON players(gameId);',
];

export async function initializeSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await tryPragma(db, 'PRAGMA foreign_keys = ON;');
  await tryPragma(db, 'PRAGMA journal_mode = WAL;');

  for (const statement of TABLES) {
    await db.executeSql(statement);
  }

  await ensureColumn(db, 'games', 'startingDealerSeatIndex', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'games', 'endedAt', 'INTEGER NULL');
  await ensureColumn(db, 'hands', 'dealerSeatIndex', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'hands', 'isDraw', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'hands', 'winnerSeatIndex', 'INTEGER NULL');
  await ensureColumn(db, 'hands', 'deltasJson', 'TEXT NULL');
  await ensureBackfillDefaults(db);

  for (const statement of INDICES) {
    await db.executeSql(statement);
  }
}

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
) {
  const [result] = await db.executeSql(`PRAGMA table_info(${table});`);
  for (let i = 0; i < result.rows.length; i += 1) {
    const row = result.rows.item(i) as { name: string };
    if (row.name === column) {
      return;
    }
  }
  await db.executeSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

async function tryPragma(db: SQLite.SQLiteDatabase, statement: string) {
  try {
    await db.executeSql(statement);
  } catch (error) {
    console.warn('[DB] PRAGMA not supported', { statement, error });
  }
}

async function ensureBackfillDefaults(db: SQLite.SQLiteDatabase) {
  try {
    // Safety net for legacy rows. Idempotent and safe on repeated launches.
    await db.executeSql('UPDATE games SET startingDealerSeatIndex = 0 WHERE startingDealerSeatIndex IS NULL;');
    await db.executeSql('UPDATE hands SET dealerSeatIndex = 0 WHERE dealerSeatIndex IS NULL;');
    await db.executeSql('UPDATE hands SET isDraw = 0 WHERE isDraw IS NULL;');
  } catch (error) {
    console.warn('[DB] backfill defaults skipped', error);
  }
}
