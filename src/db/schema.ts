import { SQLiteDatabase } from 'react-native-sqlite-storage';
import { INITIAL_ROUND_LABEL_ZH } from '../constants/game';

export const CURRENT_SCHEMA_VERSION = 300;

const APP_OWNED_TABLES = ['games', 'players', 'hands', 'cloud_archives'] as const;
const APP_OWNED_INDEXES = [
  'idx_hands_game_handIndex',
  'idx_games_createdAt',
  'idx_players_game',
  'idx_cloud_archives_createdAt',
  'idx_games_endedAt',
  'idx_games_resultStatus',
] as const;

export const APP_OWNED_SCHEMA_OBJECTS = {
  tables: APP_OWNED_TABLES,
  indexes: APP_OWNED_INDEXES,
  triggers: [] as const,
  views: [] as const,
};

export type SchemaInitializationErrorCode =
  | 'UNSUPPORTED_OLDER_SCHEMA_VERSION'
  | 'FORWARD_SCHEMA_VERSION'
  | 'SCHEMA_INITIALIZATION_FAILED';

export class SchemaVersionError extends Error {
  readonly detectedVersion: number;
  readonly code: SchemaInitializationErrorCode;

  constructor(message: string, code: SchemaInitializationErrorCode, detectedVersion: number) {
    super(message);
    this.name = 'SchemaVersionError';
    this.code = code;
    this.detectedVersion = detectedVersion;
  }
}

export class UnsupportedOlderSchemaVersionError extends SchemaVersionError {
  constructor(detectedVersion: number) {
    super(
      `Unsupported older local schema version: ${detectedVersion}.`,
      'UNSUPPORTED_OLDER_SCHEMA_VERSION',
      detectedVersion,
    );
    this.name = 'UnsupportedOlderSchemaVersionError';
  }
}

export class ForwardSchemaVersionError extends SchemaVersionError {
  constructor(detectedVersion: number) {
    super(
      `Local schema version ${detectedVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}.`,
      'FORWARD_SCHEMA_VERSION',
      detectedVersion,
    );
    this.name = 'ForwardSchemaVersionError';
  }
}

export class SchemaInitializationError extends SchemaVersionError {
  constructor(detectedVersion: number, cause?: unknown) {
    super('Unable to initialize local database schema.', 'SCHEMA_INITIALIZATION_FAILED', detectedVersion);
    this.name = 'SchemaInitializationError';
    (this as SchemaInitializationError & { cause?: unknown }).cause = cause;
  }
}

export function isSchemaInitializationError(error: unknown): error is SchemaVersionError {
  return error instanceof SchemaVersionError;
}

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
    seatRotationOffset INTEGER NOT NULL DEFAULT 0,
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
  `CREATE TABLE IF NOT EXISTS cloud_archives(
    roomId TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    endedAt INTEGER NOT NULL,
    archivedFromCloudAt INTEGER NOT NULL,
    expiresAt INTEGER NULL,
    archiveVersion INTEGER NOT NULL DEFAULT 1,
    memberCount INTEGER NOT NULL DEFAULT 0,
    handCount INTEGER NOT NULL DEFAULT 0,
    statsAppliedArchiveVersion INTEGER NULL,
    statsAppliedUid TEXT NULL,
    payloadJson TEXT NOT NULL
  );`,
];

const INDICES = [
  'CREATE INDEX IF NOT EXISTS idx_hands_game_handIndex ON hands(gameId, handIndex);',
  'CREATE INDEX IF NOT EXISTS idx_games_createdAt ON games(createdAt);',
  'CREATE INDEX IF NOT EXISTS idx_players_game ON players(gameId);',
  'CREATE INDEX IF NOT EXISTS idx_cloud_archives_createdAt ON cloud_archives(createdAt DESC);',
  'CREATE INDEX IF NOT EXISTS idx_games_endedAt ON games(endedAt);',
  'CREATE INDEX IF NOT EXISTS idx_games_resultStatus ON games(resultStatus);',
];

type SchemaObjectRow = { name: string; type: string };

export async function initializeSchema(db: SQLiteDatabase): Promise<void> {
  let detectedVersion = 0;
  try {
    await tryPragma(db, 'PRAGMA foreign_keys = ON;');
    await tryPragma(db, 'PRAGMA journal_mode = WAL;');
    detectedVersion = await readUserVersion(db);

    if (detectedVersion > CURRENT_SCHEMA_VERSION) {
      throw new ForwardSchemaVersionError(detectedVersion);
    }
    if (detectedVersion > 0 && detectedVersion < CURRENT_SCHEMA_VERSION) {
      throw new UnsupportedOlderSchemaVersionError(detectedVersion);
    }

    const isUnversionedDatabase = detectedVersion === 0;
    const legacyObjects = isUnversionedDatabase ? await findAppOwnedSchemaObjects(db) : [];
    const isLegacyTestFlightDatabase = legacyObjects.some((object) => object.type === 'table');

    await runSchemaTransaction(db, async () => {
      if (isLegacyTestFlightDatabase) {
        // Pre-launch TestFlight policy: version-0 app data is intentionally reset, never migrated.
        console.warn('[DB] Resetting pre-launch TestFlight legacy SQLite schema', {
          detectedVersion,
          objects: legacyObjects.map((object) => `${object.type}:${object.name}`),
        });
        await dropAppOwnedSchema(db);
      }

      await createAndVerifySchema(db);
    });

    if (isUnversionedDatabase) {
      // Stamp only after tables, defensive columns, backfills, indexes, and verification have succeeded.
      await db.executeSql(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};`);
    }
  } catch (error) {
    if (isSchemaInitializationError(error)) {
      throw error;
    }
    throw new SchemaInitializationError(detectedVersion, error);
  }
}

async function createAndVerifySchema(db: SQLiteDatabase): Promise<void> {
  for (const statement of TABLES) {
    await db.executeSql(statement);
  }

  await ensureColumn(db, 'games', 'startingDealerSeatIndex', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'games', 'progressIndex', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'games', 'currentWindIndex', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'games', 'currentRoundNumber', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(db, 'games', 'maxWindIndex', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(db, 'games', 'seatRotationOffset', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'games', 'gameState', "TEXT NOT NULL DEFAULT 'draft'");
  await ensureColumn(db, 'games', 'currentRoundLabelZh', 'TEXT NULL');
  await ensureColumn(db, 'games', 'languageOverride', 'TEXT NULL');
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
  await ensureColumn(db, 'cloud_archives', 'expiresAt', 'INTEGER NULL');
  await ensureColumn(db, 'cloud_archives', 'archiveVersion', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(db, 'cloud_archives', 'memberCount', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'cloud_archives', 'handCount', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'cloud_archives', 'statsAppliedArchiveVersion', 'INTEGER NULL');
  await ensureColumn(db, 'cloud_archives', 'statsAppliedUid', 'TEXT NULL');
  await ensureColumn(db, 'cloud_archives', 'payloadJson', 'TEXT NOT NULL DEFAULT "{}"');
  await ensureBackfillDefaults(db);

  for (const statement of INDICES) {
    await db.executeSql(statement);
  }

  await verifyRequiredTables(db);
}

async function readUserVersion(db: SQLiteDatabase): Promise<number> {
  const [result] = await db.executeSql('PRAGMA user_version;');
  const version = Number((result.rows.item(0) as { user_version?: number } | undefined)?.user_version ?? 0);
  return Number.isInteger(version) && version >= 0 ? version : 0;
}

async function findAppOwnedSchemaObjects(db: SQLiteDatabase): Promise<SchemaObjectRow[]> {
  const [result] = await db.executeSql(
    "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger', 'view') AND name NOT LIKE 'sqlite_%';",
  );
  const appOwnedNames = new Set<string>([
    ...APP_OWNED_TABLES,
    ...APP_OWNED_INDEXES,
    ...APP_OWNED_SCHEMA_OBJECTS.triggers,
    ...APP_OWNED_SCHEMA_OBJECTS.views,
  ]);
  const objects: SchemaObjectRow[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows.item(index) as SchemaObjectRow;
    if (appOwnedNames.has(row.name)) {
      objects.push(row);
    }
  }
  return objects;
}

async function dropAppOwnedSchema(db: SQLiteDatabase): Promise<void> {
  // Every identifier below is a hard-coded app-owned object. Never enumerate-and-drop sqlite_master results.
  for (const index of APP_OWNED_INDEXES) {
    await db.executeSql(`DROP INDEX IF EXISTS ${index};`);
  }
  for (const table of ['hands', 'players', 'cloud_archives', 'games'] as const) {
    await db.executeSql(`DROP TABLE IF EXISTS ${table};`);
  }
}

async function verifyRequiredTables(db: SQLiteDatabase): Promise<void> {
  const [result] = await db.executeSql(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
  );
  const existingTables = new Set<string>();
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows.item(index) as { name: string };
    existingTables.add(row.name);
  }
  const missingTables = APP_OWNED_TABLES.filter((table) => !existingTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Required SQLite tables are missing: ${missingTables.join(', ')}.`);
  }
}

async function runSchemaTransaction(db: SQLiteDatabase, work: () => Promise<void>): Promise<void> {
  await db.executeSql('BEGIN IMMEDIATE;');
  try {
    await work();
    await db.executeSql('COMMIT;');
  } catch (error) {
    try {
      await db.executeSql('ROLLBACK;');
    } catch (rollbackError) {
      console.warn('[DB] schema initialization rollback failed', rollbackError);
    }
    throw error;
  }
}

async function ensureColumn(
  db: SQLiteDatabase,
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

async function tryPragma(db: SQLiteDatabase, statement: string) {
  try {
    await db.executeSql(statement);
  } catch (error) {
    console.warn('[DB] PRAGMA not supported', { statement, error });
  }
}

async function ensureBackfillDefaults(db: SQLiteDatabase) {
  // A failed required backfill must abort initialization before the version stamp is written.
  await db.executeSql('UPDATE games SET startingDealerSeatIndex = 0 WHERE startingDealerSeatIndex IS NULL;');
  await db.executeSql('UPDATE games SET progressIndex = 0 WHERE progressIndex IS NULL;');
  await db.executeSql('UPDATE games SET currentWindIndex = 0 WHERE currentWindIndex IS NULL;');
  await db.executeSql('UPDATE games SET currentRoundNumber = 1 WHERE currentRoundNumber IS NULL;');
  await db.executeSql('UPDATE games SET maxWindIndex = 1 WHERE maxWindIndex IS NULL;');
  await db.executeSql('UPDATE games SET seatRotationOffset = 0 WHERE seatRotationOffset IS NULL;');
  await db.executeSql("UPDATE games SET gameState = 'draft' WHERE gameState IS NULL OR gameState = '';");
  await db.executeSql(
    `UPDATE games SET currentRoundLabelZh = '${INITIAL_ROUND_LABEL_ZH}' WHERE currentRoundLabelZh IS NULL;`,
  );
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
}
