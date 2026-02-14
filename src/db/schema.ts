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
    currentWindIndex INTEGER NOT NULL DEFAULT 0,
    currentRoundNumber INTEGER NOT NULL DEFAULT 1,
    maxWindIndex INTEGER NOT NULL DEFAULT 1,
    gameState TEXT NOT NULL DEFAULT 'draft',
    currentRoundLabelZh TEXT NULL,
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
    windIndex INTEGER NOT NULL DEFAULT 0,
    roundNumber INTEGER NOT NULL DEFAULT 1,
    isDraw INTEGER NOT NULL DEFAULT 0,
    winnerSeatIndex INTEGER NULL,
    type TEXT,
    winnerPlayerId TEXT NULL,
    discarderPlayerId TEXT NULL,
    inputValue REAL NULL,
    deltasJson TEXT NULL,
    nextRoundLabelZh TEXT NULL,
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
  await ensureColumn(db, 'games', 'progressIndex', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'games', 'currentWindIndex', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'games', 'currentRoundNumber', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(db, 'games', 'maxWindIndex', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(db, 'games', 'gameState', "TEXT NOT NULL DEFAULT 'draft'");
  await ensureColumn(db, 'games', 'currentRoundLabelZh', 'TEXT NULL');
  await ensureColumn(db, 'games', 'endedAt', 'INTEGER NULL');
  await ensureColumn(db, 'games', 'handsCount', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'games', 'resultStatus', 'TEXT NULL');
  await ensureColumn(db, 'games', 'resultSummaryJson', 'TEXT NULL');
  await ensureColumn(db, 'games', 'resultUpdatedAt', 'INTEGER NULL');
  await ensureColumn(db, 'hands', 'dealerSeatIndex', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'hands', 'windIndex', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'hands', 'roundNumber', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(db, 'hands', 'isDraw', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'hands', 'winnerSeatIndex', 'INTEGER NULL');
  await ensureColumn(db, 'hands', 'deltasJson', 'TEXT NULL');
  await ensureColumn(db, 'hands', 'nextRoundLabelZh', 'TEXT NULL');
  await ensureBackfillDefaults(db);

  for (const statement of INDICES) {
    await db.executeSql(statement);
  }

  await db.executeSql('CREATE INDEX IF NOT EXISTS idx_games_endedAt ON games(endedAt);');
  await db.executeSql('CREATE INDEX IF NOT EXISTS idx_games_resultStatus ON games(resultStatus);');
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
    await db.executeSql('UPDATE games SET progressIndex = 0 WHERE progressIndex IS NULL;');
    await db.executeSql('UPDATE games SET currentWindIndex = 0 WHERE currentWindIndex IS NULL;');
    await db.executeSql('UPDATE games SET currentRoundNumber = 1 WHERE currentRoundNumber IS NULL;');
    await db.executeSql('UPDATE games SET maxWindIndex = 1 WHERE maxWindIndex IS NULL;');
    await db.executeSql("UPDATE games SET gameState = 'draft' WHERE gameState IS NULL OR gameState = '';");
    await db.executeSql("UPDATE games SET currentRoundLabelZh = '東風東局' WHERE currentRoundLabelZh IS NULL;");
    await db.executeSql('UPDATE games SET handsCount = 0 WHERE handsCount IS NULL;');
    await db.executeSql(`
      UPDATE games
      SET gameState = CASE
        WHEN endedAt IS NOT NULL AND COALESCE(handsCount, 0) = 0 THEN 'abandoned'
        WHEN endedAt IS NOT NULL AND COALESCE(handsCount, 0) > 0 THEN 'ended'
        WHEN endedAt IS NULL AND COALESCE(handsCount, 0) > 0 THEN 'active'
        ELSE 'draft'
      END;
    `);
    await db.executeSql('UPDATE hands SET dealerSeatIndex = 0 WHERE dealerSeatIndex IS NULL;');
    await db.executeSql('UPDATE hands SET windIndex = 0 WHERE windIndex IS NULL;');
    await db.executeSql('UPDATE hands SET roundNumber = 1 WHERE roundNumber IS NULL;');
    await db.executeSql('UPDATE hands SET isDraw = 0 WHERE isDraw IS NULL;');
  } catch (error) {
    console.warn('[DB] backfill defaults skipped', error);
  }
}
