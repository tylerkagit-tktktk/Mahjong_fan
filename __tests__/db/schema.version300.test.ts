import { SQLiteDatabase } from 'react-native-sqlite-storage';
import {
  APP_OWNED_SCHEMA_OBJECTS,
  CURRENT_SCHEMA_VERSION,
  ForwardSchemaVersionError,
  initializeSchema,
  SchemaInitializationError,
  UnsupportedOlderSchemaVersionError,
} from '../../src/db/schema';
import { ActualSqliteDatabase } from '../../test-support/sqlite/actualSqliteDatabase';

const mockOpenDatabase = jest.fn();

jest.mock('react-native-sqlite-storage', () => ({
  __esModule: true,
  default: {
    enablePromise: jest.fn(),
    openDatabase: (...args: unknown[]) => mockOpenDatabase(...args),
  },
}));

const requiredTables = APP_OWNED_SCHEMA_OBJECTS.tables;

async function queryRows(db: ActualSqliteDatabase, sql: string): Promise<Array<Record<string, unknown>>> {
  const [result] = await db.executeSql(sql);
  const typedResult = result as { rows: { length: number; item: (index: number) => Record<string, unknown> } };
  return Array.from({ length: typedResult.rows.length }, (_, index) => typedResult.rows.item(index));
}

async function userVersion(db: ActualSqliteDatabase): Promise<number> {
  const rows = await queryRows(db, 'PRAGMA user_version;');
  return Number(rows[0].user_version);
}

async function tableNames(db: ActualSqliteDatabase): Promise<string[]> {
  const rows = await queryRows(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
  );
  return rows.map((row) => String(row.name));
}

async function createVersion300Database(db: ActualSqliteDatabase): Promise<void> {
  await db.executeSql(`CREATE TABLE games(
    id TEXT PRIMARY KEY,
    title TEXT,
    createdAt INTEGER,
    endedAt INTEGER,
    resultStatus TEXT,
    seatRotationOffset INTEGER NOT NULL DEFAULT 0
  );`);
  await db.executeSql('CREATE TABLE players(id TEXT PRIMARY KEY, gameId TEXT, name TEXT, seatIndex INTEGER);');
  await db.executeSql('CREATE TABLE hands(id TEXT PRIMARY KEY, gameId TEXT, handIndex INTEGER);');
  await db.executeSql('CREATE TABLE cloud_archives(roomId TEXT PRIMARY KEY, createdAt INTEGER);');
  await db.executeSql('CREATE INDEX idx_hands_game_handIndex ON hands(gameId, handIndex);');
  await db.executeSql('CREATE INDEX idx_games_createdAt ON games(createdAt);');
  await db.executeSql('CREATE INDEX idx_players_game ON players(gameId);');
  await db.executeSql('CREATE INDEX idx_cloud_archives_createdAt ON cloud_archives(createdAt DESC);');
  await db.executeSql('CREATE INDEX idx_games_endedAt ON games(endedAt);');
  await db.executeSql('CREATE INDEX idx_games_resultStatus ON games(resultStatus);');
  await db.executeSql('PRAGMA user_version = 300;');
}

describe('SQLite schema version 303 bootstrap', () => {
  let databases: ActualSqliteDatabase[] = [];

  beforeEach(() => {
    databases = [];
  });

  afterEach(async () => {
    await Promise.all(databases.map((db) => db.close()));
  });

  async function createDatabase(): Promise<ActualSqliteDatabase> {
    const db = await ActualSqliteDatabase.create();
    databases.push(db);
    return db;
  }

  it('creates a fresh database, required tables, WAL, foreign keys, and version 303', async () => {
    const db = await createDatabase();

    expect(await userVersion(db)).toBe(0);
    expect(await tableNames(db)).toEqual([]);

    await initializeSchema(db as unknown as SQLiteDatabase);

    expect(await userVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    expect(await tableNames(db)).toEqual([...requiredTables].sort());
    expect((await queryRows(db, 'PRAGMA journal_mode;'))[0].journal_mode).toBe('wal');
    expect((await queryRows(db, 'PRAGMA foreign_keys;'))[0].foreign_keys).toBe(1);
  });

  it('resets a version-0 legacy app schema and recreates it cleanly', async () => {
    const db = await createDatabase();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await db.executeSql('CREATE TABLE games(id TEXT PRIMARY KEY, title TEXT);');
    await db.executeSql("INSERT INTO games(id, title) VALUES ('legacy-game', 'Legacy');");
    await db.executeSql('CREATE INDEX idx_games_createdAt ON games(createdAt);').catch(() => undefined);

    await initializeSchema(db as unknown as SQLiteDatabase);

    expect(await userVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    expect(await tableNames(db)).toEqual([...requiredTables].sort());
    expect(await queryRows(db, 'SELECT * FROM games;')).toEqual([]);
    expect((await queryRows(db, 'PRAGMA journal_mode;'))[0].journal_mode).toBe('wal');
    expect((await queryRows(db, 'PRAGMA foreign_keys;'))[0].foreign_keys).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[DB] Resetting pre-launch TestFlight legacy SQLite schema',
      expect.objectContaining({ detectedVersion: 0 }),
    );
    warnSpy.mockRestore();
  });

  it('preserves valid version-300 data and is idempotent', async () => {
    const db = await createDatabase();
    await initializeSchema(db as unknown as SQLiteDatabase);
    await db.executeSql("INSERT INTO games(id, title) VALUES ('current-game', 'Current');");

    await initializeSchema(db as unknown as SQLiteDatabase);
    await initializeSchema(db as unknown as SQLiteDatabase);

    expect(await userVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    expect(await queryRows(db, "SELECT id, title FROM games WHERE id = 'current-game';")).toEqual([
      { id: 'current-game', title: 'Current' },
    ]);
  });

  it('migrates version 300 through 301/302 to 303 non-destructively and backfills legacy history mode', async () => {
    const db = await createDatabase();
    await createVersion300Database(db);
    await db.executeSql("INSERT INTO games(id, title, createdAt) VALUES ('g300', 'Version 300', 100);");
    await db.executeSql("INSERT INTO players(id, gameId, name, seatIndex) VALUES ('p300', 'g300', 'Player', 0);");
    await db.executeSql("INSERT INTO hands(id, gameId, handIndex) VALUES ('h300', 'g300', 0);");
    await db.executeSql("INSERT INTO cloud_archives(roomId, createdAt) VALUES ('archive300', 200);");

    await initializeSchema(db as unknown as SQLiteDatabase);

    expect(await userVersion(db)).toBe(303);
    expect(await queryRows(db, 'SELECT id, title FROM games;')).toEqual([{ id: 'g300', title: 'Version 300' }]);
    expect(await queryRows(db, 'SELECT id, gameId FROM players;')).toEqual([{ id: 'p300', gameId: 'g300' }]);
    expect(await queryRows(db, 'SELECT id, gameId FROM hands;')).toEqual([{ id: 'h300', gameId: 'g300' }]);
    expect(await queryRows(db, 'SELECT roomId FROM cloud_archives;')).toEqual([{ roomId: 'archive300' }]);
    expect(await queryRows(db, "SELECT seatBoundaryHistoryMode FROM games WHERE id = 'g300';")).toEqual([
      { seatBoundaryHistoryMode: 'legacy_inferred' },
    ]);
    expect(await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_seat_boundaries';")).toEqual([
      { name: 'game_seat_boundaries' },
    ]);
    expect(await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_game_seat_boundaries_game_effective';")).toEqual([
      { name: 'idx_game_seat_boundaries_game_effective' },
    ]);
    expect(await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_hand_revisions';")).toEqual([
      { name: 'game_hand_revisions' },
    ]);
    expect(await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_game_hand_revisions_game_revision';")).toEqual([
      { name: 'idx_game_hand_revisions_game_revision' },
    ]);

    await initializeSchema(db as unknown as SQLiteDatabase);
    expect(await userVersion(db)).toBe(303);
    expect(await queryRows(db, "SELECT seatBoundaryHistoryMode FROM games WHERE id = 'g300';")).toEqual([
      { seatBoundaryHistoryMode: 'legacy_inferred' },
    ]);
  });

  it('migrates a version-301 database through hand revisions and historical lifecycle compatibility without changing game rows', async () => {
    const db = await createDatabase();
    await initializeSchema(db as unknown as SQLiteDatabase);
    await db.executeSql("INSERT INTO games(id, title) VALUES ('g301', 'Version 301');");
    await db.executeSql('DROP INDEX idx_game_hand_revisions_game_revision;');
    await db.executeSql('DROP TABLE game_hand_revisions;');
    await db.executeSql('PRAGMA user_version = 301;');

    await initializeSchema(db as unknown as SQLiteDatabase);

    expect(await userVersion(db)).toBe(303);
    expect(await queryRows(db, "SELECT id, title FROM games WHERE id = 'g301';")).toEqual([{ id: 'g301', title: 'Version 301' }]);
    expect(await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_hand_revisions';")).toEqual([
      { name: 'game_hand_revisions' },
    ]);
    expect(await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_lifecycle_revisions';")).toEqual([
      { name: 'game_lifecycle_revisions' },
    ]);
  });

  it('preserves existing schema-303 historical lifecycle revisions without creating a new migration', async () => {
    const db = await createDatabase();
    await initializeSchema(db as unknown as SQLiteDatabase);
    await db.executeSql("INSERT INTO games(id, title) VALUES ('historical-lifecycle', 'Historical lifecycle');");
    await db.executeSql(
      `INSERT INTO game_lifecycle_revisions
       (id, gameId, lifecycleRevisionIndex, recordMutationVersion, action, beforeGameJson, afterGameJson, actorType, actorId, reason, createdAt)
       VALUES ('historical-lifecycle:0', 'historical-lifecycle', 0, 2, 'reopen', '{"version":1}', '{"version":1}', 'local_user', NULL, NULL, 1);`,
    );

    await initializeSchema(db as unknown as SQLiteDatabase);

    expect(await userVersion(db)).toBe(303);
    expect(await queryRows(
      db,
      "SELECT id, recordMutationVersion, action FROM game_lifecycle_revisions WHERE gameId = 'historical-lifecycle';",
    )).toEqual([{ id: 'historical-lifecycle:0', recordMutationVersion: 2, action: 'reopen' }]);
  });

  it('rolls back a failed 300 to 301 migration and can retry through 303 without data loss', async () => {
    const db = await createDatabase();
    await createVersion300Database(db);
    await db.executeSql("INSERT INTO games(id, title) VALUES ('rollback-300', 'Keep me');");
    const originalExecuteSql = db.executeSql.bind(db);
    let failOnce = true;
    db.executeSql = async (sql, params) => {
      if (failOnce && sql.includes('CREATE TABLE IF NOT EXISTS game_seat_boundaries')) {
        failOnce = false;
        throw new Error('Injected migration failure');
      }
      return originalExecuteSql(sql, params);
    };

    await expect(initializeSchema(db as unknown as SQLiteDatabase)).rejects.toBeInstanceOf(SchemaInitializationError);
    expect(await userVersion(db)).toBe(300);
    expect(await queryRows(db, 'SELECT id, title FROM games;')).toEqual([{ id: 'rollback-300', title: 'Keep me' }]);
    expect(await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_seat_boundaries';")).toEqual([]);
    expect(await queryRows(db, 'PRAGMA table_info(games);')).not.toContainEqual(
      expect.objectContaining({ name: 'seatBoundaryHistoryMode' }),
    );

    await initializeSchema(db as unknown as SQLiteDatabase);
    expect(await userVersion(db)).toBe(303);
    expect(await queryRows(db, 'SELECT id, title FROM games;')).toEqual([{ id: 'rollback-300', title: 'Keep me' }]);
  });

  it('cascades boundary rows when their game is deleted', async () => {
    const db = await createDatabase();
    await initializeSchema(db as unknown as SQLiteDatabase);
    await db.executeSql("INSERT INTO games(id, title) VALUES ('cascade-game', 'Cascade');");
    await db.executeSql(
      "INSERT INTO game_seat_boundaries(id, gameId, effectiveFromHandIndex, seatMappingJson, reason, createdAt) VALUES ('b1', 'cascade-game', 0, '{\"0\":\"p0\",\"1\":\"p1\",\"2\":\"p2\",\"3\":\"p3\"}', 'confirmed_reseat', 1);",
    );
    await db.executeSql(
      "INSERT INTO game_hand_revisions(id, gameId, revisionIndex, action, targetHandId, targetHandIndex, beforeHandJson, afterHandJson, actorType, actorId, reason, createdAt) VALUES ('r1', 'cascade-game', 0, 'remove', 'h1', 0, '{\"version\":1,\"hand\":{}}', NULL, 'local_user', NULL, NULL, 1);",
    );
    await db.executeSql("DELETE FROM games WHERE id = 'cascade-game';");
    expect(await queryRows(db, 'SELECT id FROM game_seat_boundaries;')).toEqual([]);
    expect(await queryRows(db, 'SELECT id FROM game_hand_revisions;')).toEqual([]);
  });

  it('rejects unsupported older schema versions without changing rows or version', async () => {
    const db = await createDatabase();
    await db.executeSql('CREATE TABLE games(id TEXT PRIMARY KEY, title TEXT);');
    await db.executeSql("INSERT INTO games(id, title) VALUES ('older-game', 'Older');");
    await db.executeSql('PRAGMA user_version = 299;');

    await expect(initializeSchema(db as unknown as SQLiteDatabase)).rejects.toBeInstanceOf(
      UnsupportedOlderSchemaVersionError,
    );
    expect(await userVersion(db)).toBe(299);
    expect(await queryRows(db, 'SELECT id, title FROM games;')).toEqual([{ id: 'older-game', title: 'Older' }]);
  });

  it('rejects forward schema versions without changing rows or version', async () => {
    const db = await createDatabase();
    await db.executeSql('CREATE TABLE games(id TEXT PRIMARY KEY, title TEXT);');
    await db.executeSql("INSERT INTO games(id, title) VALUES ('forward-game', 'Forward');");
    await db.executeSql('PRAGMA user_version = 304;');

    await expect(initializeSchema(db as unknown as SQLiteDatabase)).rejects.toBeInstanceOf(
      ForwardSchemaVersionError,
    );
    expect(await userVersion(db)).toBe(304);
    expect(await queryRows(db, 'SELECT id, title FROM games;')).toEqual([{ id: 'forward-game', title: 'Forward' }]);
  });

  it('does not stamp a failed initialization and can retry successfully', async () => {
    const db = await createDatabase();
    const originalExecuteSql = db.executeSql.bind(db);
    let failOnce = true;
    db.executeSql = async (sql, params) => {
      if (failOnce && sql.includes('CREATE TABLE IF NOT EXISTS players')) {
        failOnce = false;
        throw new Error('Injected schema creation failure');
      }
      return originalExecuteSql(sql, params);
    };

    await expect(initializeSchema(db as unknown as SQLiteDatabase)).rejects.toBeInstanceOf(SchemaInitializationError);
    expect(await userVersion(db)).toBe(0);
    expect(await tableNames(db)).toEqual([]);

    await initializeSchema(db as unknown as SQLiteDatabase);
    expect(await userVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    expect(await tableNames(db)).toEqual([...requiredTables].sort());
  });

  it('treats a version-0 database with only system tables as fresh, not legacy', async () => {
    const db = await createDatabase();
    await db.executeSql('CREATE TABLE external_seed(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT);');
    await db.executeSql("INSERT INTO external_seed(value) VALUES ('keep');");

    await initializeSchema(db as unknown as SQLiteDatabase);

    expect(await userVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    expect(await queryRows(db, 'SELECT value FROM external_seed;')).toEqual([{ value: 'keep' }]);
    expect(await queryRows(db, "SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence';")).toEqual([
      { name: 'sqlite_sequence' },
    ]);
  });

  it('retries initialization through the cached database boundary after one failure', async () => {
    const db = await createDatabase();
    const originalExecuteSql = db.executeSql.bind(db);
    let failOnce = true;
    db.executeSql = async (sql, params) => {
      if (failOnce && sql.includes('CREATE TABLE IF NOT EXISTS players')) {
        failOnce = false;
        throw new Error('Injected cached initialization failure');
      }
      return originalExecuteSql(sql, params);
    };
    mockOpenDatabase.mockResolvedValue(db);
    jest.resetModules();
    const { getDatabase } = require('../../src/db/sqlite') as typeof import('../../src/db/sqlite');

    await expect(getDatabase()).rejects.toMatchObject({
      code: 'SCHEMA_INITIALIZATION_FAILED',
      detectedVersion: 0,
    });
    await expect(getDatabase()).resolves.toBe(db);
    expect(mockOpenDatabase).toHaveBeenCalledTimes(1);
    expect(await userVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });
});
