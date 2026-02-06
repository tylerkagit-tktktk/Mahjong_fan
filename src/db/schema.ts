import SQLite from 'react-native-sqlite-storage';

const TABLES = [
  `CREATE TABLE IF NOT EXISTS games(
    id TEXT PRIMARY KEY,
    title TEXT,
    createdAt INTEGER,
    currencySymbol TEXT,
    variant TEXT,
    rulesJson TEXT,
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
    type TEXT,
    winnerPlayerId TEXT NULL,
    discarderPlayerId TEXT NULL,
    inputValue REAL NULL,
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

  for (const statement of INDICES) {
    await db.executeSql(statement);
  }
}

async function tryPragma(db: SQLite.SQLiteDatabase, statement: string) {
  try {
    await db.executeSql(statement);
  } catch (error) {
    console.warn('[DB] PRAGMA not supported', { statement, error });
  }
}
