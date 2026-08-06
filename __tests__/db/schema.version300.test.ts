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

describe('SQLite schema version 300 bootstrap', () => {
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

  it('creates a fresh database, required tables, WAL, foreign keys, and version 300', async () => {
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
    await db.executeSql('PRAGMA user_version = 301;');

    await expect(initializeSchema(db as unknown as SQLiteDatabase)).rejects.toBeInstanceOf(
      ForwardSchemaVersionError,
    );
    expect(await userVersion(db)).toBe(301);
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
