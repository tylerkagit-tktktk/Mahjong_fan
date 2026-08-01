import { HandLog, RoomLineup } from '../../models/cloud';
import { listHandsAfter } from './handRepo';
import { getLineupByVersion } from './roomRepo';

export type RoomTimelineCache = {
  hands: HandLog[];
  lineups: RoomLineup[];
};

type SyncRoomTimelineInput = {
  roomId: string;
  currentHandIndex: number;
  activeLineupVersion: number;
  cache: RoomTimelineCache;
  activeLineup?: RoomLineup | null;
  requireAllLineupVersions?: boolean;
};

function normalizeHands(hands: HandLog[], throughHandIndex: number): HandLog[] | null {
  const sorted = [...hands].sort((left, right) => left.handIndex - right.handIndex);
  if (sorted.length !== throughHandIndex) return null;
  return sorted.every((hand, index) => hand.handIndex === index + 1) ? sorted : null;
}

export async function syncRoomTimeline({
  roomId,
  currentHandIndex,
  activeLineupVersion,
  cache,
  activeLineup,
  requireAllLineupVersions = false,
}: SyncRoomTimelineInput): Promise<RoomTimelineCache> {
  const targetHandIndex = Math.max(0, currentHandIndex);
  let hands = normalizeHands(cache.hands, cache.hands.length) ?? [];

  if (hands.length > targetHandIndex) {
    hands = [];
  }

  if (hands.length < targetHandIndex) {
    const newHands = await listHandsAfter(roomId, hands.length, targetHandIndex);
    const mergedHands = normalizeHands([...hands, ...newHands], targetHandIndex);
    if (mergedHands) {
      hands = mergedHands;
    } else {
      const recoveredHands = await listHandsAfter(roomId, 0, targetHandIndex);
      const normalizedRecovery = normalizeHands(recoveredHands, targetHandIndex);
      if (!normalizedRecovery) {
        throw new Error(`Incomplete room timeline: expected ${targetHandIndex} hands`);
      }
      hands = normalizedRecovery;
    }
  }

  const lineupByVersion = new Map<number, RoomLineup>();
  cache.lineups.forEach((entry) => lineupByVersion.set(entry.lineupVersion, entry));
  if (activeLineup) {
    lineupByVersion.set(activeLineup.lineupVersion, activeLineup);
  }

  const requiredVersions = new Set(hands.map((hand) => hand.lineupVersion));
  if (requireAllLineupVersions) {
    for (let version = 1; version <= activeLineupVersion; version += 1) {
      requiredVersions.add(version);
    }
  } else if (activeLineupVersion > 0) {
    requiredVersions.add(activeLineupVersion);
  }
  const missingVersions = [...requiredVersions].filter((version) => !lineupByVersion.has(version));
  const missingLineups = await Promise.all(
    missingVersions.map((version) => getLineupByVersion(roomId, version)),
  );
  missingVersions.forEach((version, index) => {
    const entry = missingLineups[index];
    if (!entry) {
      throw new Error(`Missing room lineup version ${version}`);
    }
    lineupByVersion.set(version, entry);
  });

  return {
    hands,
    lineups: [...lineupByVersion.values()].sort(
      (left, right) => left.lineupVersion - right.lineupVersion,
    ),
  };
}
