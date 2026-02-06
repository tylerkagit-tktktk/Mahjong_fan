import SQLite from 'react-native-sqlite-storage';
import { initializeSchema } from './schema';

const DB_NAME = 'mahjong_be_fd.db';

SQLite.enablePromise(true);

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let schemaReady = false;

async function openDb(): Promise<SQLite.SQLiteDatabase> {
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
}

export async function executeSql<T = SQLite.ResultSet>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T> {
  try {
    const db = await openDb();
    const [result] = await db.executeSql(sql, params);
    return result as T;
  } catch (error) {
    console.error('[DB] executeSql failed', { sql, params, error });
    throw error;
  }
}

export async function runInTransaction<T>(
  runner: (tx: SQLite.Transaction) => Promise<T>,
): Promise<T> {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    db.transaction(
      (tx) => {
        runner(tx)
          .then(resolve)
          .catch((error) => {
            console.error('[DB] transaction runner failed', error);
            reject(error);
            throw error;
          });
      },
      (error) => {
        console.error('[DB] transaction failed', error);
        reject(error);
      },
    );
  });
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  return openDb();
}
