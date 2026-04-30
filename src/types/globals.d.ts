declare module 'react-native-sqlite-storage' {
  export type SQLiteDatabase = {
    executeSql: (
      statement: string,
      params?: ReadonlyArray<string | number | null>,
    ) => Promise<[ResultSet]>;
  };

  export type ResultSet = {
    rows: {
      length: number;
      item: (index: number) => unknown;
    };
    insertId?: number;
    rowsAffected?: number;
  };

  export function enablePromise(enabled: boolean): void;

  export function openDatabase(config: {
    name: string;
    location: string;
  }): Promise<SQLiteDatabase>;

  const SQLite: {
    enablePromise: typeof enablePromise;
    openDatabase: typeof openDatabase;
  };

  export default SQLite;
}

interface CryptoLike {
  randomUUID?: () => string;
}

declare const crypto: CryptoLike | undefined;

interface WindowOrWorkerGlobalScope {
  crypto?: CryptoLike;
}

declare const global: typeof globalThis & {
  HermesInternal?: {
    enablePromiseRejectionTracker?: (options: {
      allRejections?: boolean;
      onUnhandled?: (id: number, rejection: unknown) => void;
      onHandled?: (id: number) => void;
    }) => void;
    defaultPromiseRejectionTrackingOptions?: {
      onUnhandled?: (id: number, rejection: unknown) => void;
      onHandled?: (id: number) => void;
    };
  };
};
