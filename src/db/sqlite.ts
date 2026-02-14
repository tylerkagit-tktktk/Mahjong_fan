import SQLite from 'react-native-sqlite-storage';
import { initializeSchema } from './schema';
import { dumpBreadcrumbs, setBreadcrumb } from '../debug/breadcrumbs';
import { isDev } from '../debug/isDev';

const DB_NAME = 'mahjong_be_fd.db';

SQLite.enablePromise(true);

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let schemaReady = false;
let writeQueue: Promise<void> = Promise.resolve();

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabase({
      name: DB_NAME,
      location: 'default',
    });
  }

  let db: SQLite.SQLiteDatabase;
  try {
    db = await dbPromise;
  } catch (error) {
    if (!error && isDev) {
      console.error('[DB] falsy error at openDb', new Error('trace').stack, dumpBreadcrumbs(10));
      const bug = new Error('[BUG] falsy rejection');
      (bug as { breadcrumbs?: unknown }).breadcrumbs = dumpBreadcrumbs(10);
      throw bug;
    }
    throw error;
  }

  if (!schemaReady) {
    try {
      await initializeSchema(db);
      schemaReady = true;
    } catch (error) {
      if (!error && isDev) {
        console.error(
          '[DB] falsy error at initializeSchema',
          new Error('trace').stack,
          dumpBreadcrumbs(10),
        );
        const bug = new Error('[BUG] falsy rejection');
        (bug as { breadcrumbs?: unknown }).breadcrumbs = dumpBreadcrumbs(10);
        throw bug;
      }
      throw error;
    }
  }

  return db;
}

export async function withDb<T>(runner: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  return runner(db);
}

export async function runWithWriteLock<T>(runner: () => Promise<T>): Promise<T> {
  const prev = writeQueue;
  let release: (() => void) | null = null;
  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await prev;
  try {
    return await runner();
  } finally {
    release?.();
  }
}

export async function executeSql<T = SQLite.ResultSet>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T> {
  try {
    const db = await openDb();
    if (isDev) {
      setBreadcrumb('SQL execute', { statement: sql, params });
    }
    const [result] = await db.executeSql(sql, params);
    return result as T;
  } catch (error) {
    if (!error && isDev) {
      console.error('[DB] falsy error at executeSql', new Error('trace').stack, {
        sql,
        params,
      });
      const bug = new Error('[BUG] falsy rejection');
      (bug as { breadcrumbs?: unknown }).breadcrumbs = dumpBreadcrumbs(10);
      throw bug;
    }
    console.error('[DB] executeSql failed', { sql, params, error });
    throw error;
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  return openDb();
}
