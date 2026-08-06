import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

type SqliteRow = Record<string, unknown>;

type PendingRequest = {
  resolve: (rows: SqliteRow[]) => void;
  reject: (error: Error) => void;
};

const PYTHON_SQLITE_SERVER = String.raw`
import json
import sqlite3
import sys

connection = sqlite3.connect(sys.argv[1], isolation_level=None)
connection.row_factory = sqlite3.Row

for line in sys.stdin:
    request = json.loads(line)
    if request.get('close'):
        connection.close()
        break
    try:
        cursor = connection.execute(request['sql'], request.get('params', []))
        rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
        print(json.dumps({'id': request['id'], 'ok': True, 'rows': rows}), flush=True)
    except Exception as error:
        print(json.dumps({'id': request['id'], 'ok': False, 'error': str(error)}), flush=True)
`;

/**
 * Minimal react-native-sqlite-storage-shaped adapter backed by a real temporary SQLite database.
 * It exists only to characterize schema state in Jest; the app never imports this file.
 */
export class ActualSqliteDatabase {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private stdoutBuffer = '';

  private constructor(
    private readonly directory: string,
    readonly databasePath: string,
    process: ChildProcessWithoutNullStreams,
  ) {
    this.process = process;
    this.process.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk.toString()));
    this.process.on('error', (error) => this.rejectPending(error));
    this.process.on('exit', (code) => {
      if (this.pending.size > 0) {
        this.rejectPending(new Error(`Temporary SQLite process exited unexpectedly (${code ?? 'unknown'}).`));
      }
    });
  }

  static async create(): Promise<ActualSqliteDatabase> {
    const directory = await mkdtemp(path.join(tmpdir(), 'mahjong-schema-test-'));
    const databasePath = path.join(directory, 'database.sqlite');
    const process = spawn('/usr/bin/python3', ['-u', '-c', PYTHON_SQLITE_SERVER, databasePath]);
    return new ActualSqliteDatabase(directory, databasePath, process);
  }

  async executeSql(sql: string, params: unknown[] = []): Promise<[unknown]> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    const rows = await new Promise<SqliteRow[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(`${JSON.stringify({ id, sql, params })}\n`);
    });
    return [
      {
        rows: {
          length: rows.length,
          item: (index: number) => rows[index],
        },
      },
    ];
  }

  async close(): Promise<void> {
    this.process.stdin.end(`${JSON.stringify({ close: true })}\n`);
    await new Promise<void>((resolve) => this.process.once('exit', () => resolve()));
    await rm(this.directory, { recursive: true, force: true });
  }

  private handleStdout(chunk: string) {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      const response = JSON.parse(line) as { id: number; ok: boolean; rows?: SqliteRow[]; error?: string };
      const pending = this.pending.get(response.id);
      if (pending) {
        this.pending.delete(response.id);
        if (response.ok) {
          pending.resolve(response.rows ?? []);
        } else {
          pending.reject(new Error(response.error ?? 'Temporary SQLite command failed.'));
        }
      }
      newlineIndex = this.stdoutBuffer.indexOf('\n');
    }
  }

  private rejectPending(error: Error) {
    this.pending.forEach((pending) => pending.reject(error));
    this.pending.clear();
  }
}
