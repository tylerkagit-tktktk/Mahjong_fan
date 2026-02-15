import SQLite from 'react-native-sqlite-storage';
import { initializeSchema } from './schema';
import { dumpBreadcrumbs, setBreadcrumb } from '../debug/breadcrumbs';
import { isDev } from '../debug/isDev';

const DB_NAME = 'mahjong_be_fd.db';

SQLite.enablePromise(true);

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let schemaReady = false;
let writeQueue: Promise<void> = Promise.resolve();

export function normalizeError(error: unknown, context: string): Error {
  const fallback = new Error('Unable to access local data. Please try again.');
  if (error instanceof Error) {
    if (isDev) {
      console.warn(`[DB] ${context}`, error);
    }
    (fallback as Error & { cause?: unknown }).cause = error;
    return fallback;
  }
  if (!error) {
    if (isDev) {
      (fallback as Error & { breadcrumbs?: unknown }).breadcrumbs = dumpBreadcrumbs(10);
      console.warn(`[DB] ${context} received falsy error`, dumpBreadcrumbs(10));
    }
    return fallback;
  }
  if (isDev) {
    console.warn(`[DB] ${context} non-error rejection`, error);
  }
  (fallback as Error & { cause?: unknown }).cause = error;
  return fallback;
}

export async function safeDbCall<T>(context: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw normalizeError(error, context);
  }
}

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  return safeDbCall('openDb', async () => {
    if (!dbPromise) {
      dbPromise = SQLite.openDatabase({
        name: DB_NAME,
        location: 'default',
      });
    }

    const db = await dbPromise;
    if (!schemaReady) {
      await initializeSchema(db);
      schemaReady = true;
    }

    return db;
  });
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
  return safeDbCall('executeSql', async () => {
    const db = await openDb();
    if (isDev) {
      setBreadcrumb('SQL execute', { statement: sql, params });
    }
    const [result] = await db.executeSql(sql, params);
    return result as T;
  }).catch((error) => {
    console.error('[DB] executeSql failed', { sql, params, error });
    throw error;
  });
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  return openDb();
}
