import { CloudArchivePayload, CloudArchiveSummary } from '../models/cloud';
import { executeSql, normalizeError } from './sqlite';

type CloudArchiveRow = {
  roomId: string;
  title: string;
  createdAt: number;
  endedAt: number;
  archivedFromCloudAt: number;
  expiresAt?: number | null;
  archiveVersion: number;
  memberCount: number;
  handCount: number;
  payloadJson: string;
};

function rowsToArray<T extends object>(rows: { length: number; item: (index: number) => unknown }): T[] {
  const items: T[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    items.push(rows.item(index) as T);
  }
  return items;
}

function formatArchiveTitle(createdAt: number): string {
  const date = new Date(createdAt);
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  const hh = `${date.getHours()}`.padStart(2, '0');
  const min = `${date.getMinutes()}`.padStart(2, '0');
  return `雲端牌局 ${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

function toSummary(row: CloudArchiveRow): CloudArchiveSummary {
  return {
    roomId: row.roomId,
    title: row.title,
    createdAt: Number(row.createdAt),
    endedAt: Number(row.endedAt),
    archivedFromCloudAt: Number(row.archivedFromCloudAt),
    expiresAt: row.expiresAt == null ? null : Number(row.expiresAt),
    archiveVersion: Number(row.archiveVersion),
    memberCount: Number(row.memberCount),
    handCount: Number(row.handCount),
  };
}

export async function saveCloudArchive(payload: CloudArchivePayload): Promise<CloudArchiveSummary> {
  try {
    const summary = {
      roomId: payload.room.roomId,
      title: payload.room.title.trim() || formatArchiveTitle(payload.room.createdAt),
      createdAt: payload.room.createdAt,
      endedAt: payload.room.archiveReadyAt ?? payload.archivedFromCloudAt,
      archivedFromCloudAt: payload.archivedFromCloudAt,
      expiresAt: payload.room.expiresAt ?? null,
      archiveVersion: payload.archiveVersion,
      memberCount: payload.members.length + payload.tempPlayers.length,
      handCount: payload.hands.length,
    } satisfies CloudArchiveSummary;

    await executeSql(
      `INSERT OR REPLACE INTO cloud_archives
       (roomId, title, createdAt, endedAt, archivedFromCloudAt, expiresAt, archiveVersion, memberCount, handCount, payloadJson)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        summary.roomId,
        summary.title,
        summary.createdAt,
        summary.endedAt,
        summary.archivedFromCloudAt,
        summary.expiresAt,
        summary.archiveVersion,
        summary.memberCount,
        summary.handCount,
        JSON.stringify(payload),
      ],
    );

    return summary;
  } catch (error) {
    throw normalizeError(error, 'saveCloudArchive failed');
  }
}

export async function listCloudArchives(): Promise<CloudArchiveSummary[]> {
  try {
    const result = await executeSql(
      `SELECT roomId, title, createdAt, endedAt, archivedFromCloudAt, expiresAt, archiveVersion, memberCount, handCount, payloadJson
       FROM cloud_archives
       ORDER BY createdAt DESC;`,
    );
    return rowsToArray<CloudArchiveRow>(result.rows).map(toSummary);
  } catch (error) {
    throw normalizeError(error, 'listCloudArchives failed');
  }
}

export async function loadCloudArchive(roomId: string): Promise<CloudArchivePayload | null> {
  try {
    const result = await executeSql('SELECT payloadJson FROM cloud_archives WHERE roomId = ? LIMIT 1;', [roomId]);
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows.item(0) as { payloadJson?: string | null };
    if (!row?.payloadJson) {
      return null;
    }
    return JSON.parse(row.payloadJson) as CloudArchivePayload;
  } catch (error) {
    throw normalizeError(error, 'loadCloudArchive failed');
  }
}

export async function listCloudArchivesPendingStats(uid: string): Promise<CloudArchivePayload[]> {
  try {
    const result = await executeSql(
      `SELECT payloadJson FROM cloud_archives
       WHERE statsAppliedArchiveVersion IS NULL
          OR statsAppliedArchiveVersion != archiveVersion
          OR statsAppliedUid IS NULL
          OR statsAppliedUid != ?
       ORDER BY createdAt DESC;`,
      [uid],
    );
    return rowsToArray<{ payloadJson?: string | null }>(result.rows)
      .flatMap((row) => {
        if (!row.payloadJson) return [];
        try {
          return [JSON.parse(row.payloadJson) as CloudArchivePayload];
        } catch {
          return [];
        }
      });
  } catch (error) {
    throw normalizeError(error, 'listCloudArchivesPendingStats failed');
  }
}

export async function markCloudArchiveStatsApplied(roomId: string, archiveVersion: number, uid: string): Promise<void> {
  try {
    await executeSql(
      `UPDATE cloud_archives
       SET statsAppliedArchiveVersion = ?, statsAppliedUid = ?
       WHERE roomId = ? AND archiveVersion = ?;`,
      [archiveVersion, uid, roomId, archiveVersion],
    );
  } catch (error) {
    throw normalizeError(error, 'markCloudArchiveStatsApplied failed');
  }
}

export async function deleteCloudArchive(roomId: string): Promise<void> {
  try {
    await executeSql('DELETE FROM cloud_archives WHERE roomId = ?;', [roomId]);
  } catch (error) {
    throw normalizeError(error, 'deleteCloudArchive failed');
  }
}
