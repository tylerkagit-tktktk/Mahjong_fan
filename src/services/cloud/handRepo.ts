import { HandLog, RoomPlayerId, SubmitHandInput, SubmitResult } from '../../models/cloud';
import { applyHandStats } from './profileRepo';
import { getActiveLineup, getRoom, isTemporaryPlayerId } from './roomRepo';
import { loadSnapshot, makeId, now, saveSnapshot } from './storage';

function seatIds(seats: Record<'0' | '1' | '2' | '3', RoomPlayerId | null>): RoomPlayerId[] {
  return [seats['0'], seats['1'], seats['2'], seats['3']].filter((value): value is string => Boolean(value));
}

function hasUidInSeats(seats: Record<'0' | '1' | '2' | '3', RoomPlayerId | null>, uid: string): boolean {
  return seatIds(seats).includes(uid);
}

function isSeatPlayer(seats: Record<'0' | '1' | '2' | '3', RoomPlayerId | null>, playerId: string | null | undefined): boolean {
  if (!playerId) {
    return false;
  }
  return seatIds(seats).includes(playerId);
}

export async function listHands(roomId: string): Promise<HandLog[]> {
  const snapshot = await loadSnapshot();
  return snapshot.hands.filter((hand) => hand.roomId === roomId).sort((a, b) => a.handIndex - b.handIndex);
}

export async function submitHand(input: SubmitHandInput): Promise<SubmitResult> {
  const snapshot = await loadSnapshot();
  const room = snapshot.rooms.find((entry) => entry.roomId === input.roomId);
  if (!room) {
    return {
      ok: false,
      code: 'ROOM_NOT_FOUND',
      message: 'Room not found',
    };
  }
  if (room.status === 'ended' || room.status === 'archived') {
    return {
      ok: false,
      code: 'ROOM_ENDED',
      message: 'Room is already ended',
      latestVersion: room.currentVersion,
    };
  }

  if (input.baseVersion !== room.currentVersion) {
    return {
      ok: false,
      code: 'VERSION_CONFLICT',
      message: 'Version conflict',
      latestVersion: room.currentVersion,
    };
  }

  const lineup = await getActiveLineup(input.roomId);
  if (!lineup || !hasUidInSeats(lineup.seats, input.submittedByUid)) {
    return {
      ok: false,
      code: 'NOT_IN_ACTIVE_LINEUP',
      message: 'Only active real player can submit',
      latestVersion: room.currentVersion,
    };
  }

  if (input.type !== 'draw' && !isSeatPlayer(lineup.seats, input.winnerPlayerId ?? null)) {
    return {
      ok: false,
      code: 'INVALID_LINEUP',
      message: 'Winner must be in active lineup',
      latestVersion: room.currentVersion,
    };
  }

  if (input.type === 'discard' && !isSeatPlayer(lineup.seats, input.discarderPlayerId ?? null)) {
    return {
      ok: false,
      code: 'INVALID_LINEUP',
      message: 'Discarder must be in active lineup',
      latestVersion: room.currentVersion,
    };
  }

  const nextVersion = room.currentVersion + 1;
  const nextHandIndex = room.currentHandIndex + 1;
  const hand: HandLog = {
    handId: makeId('hand'),
    roomId: room.roomId,
    handIndex: nextHandIndex,
    type: input.type,
    submittedByUid: input.submittedByUid,
    baseVersion: input.baseVersion,
    serverVersion: nextVersion,
    lineupVersion: lineup.lineupVersion,
    winnerPlayerId: input.winnerPlayerId ?? null,
    discarderPlayerId: input.discarderPlayerId ?? null,
    dealerAction: input.type === 'draw' ? input.dealerAction ?? 'stick' : null,
    fan: input.fan ?? 3,
    createdAt: now(),
  };

  snapshot.hands.push(hand);
  room.currentHandIndex = nextHandIndex;
  room.currentVersion = nextVersion;
  room.status = 'active';
  room.updatedAt = now();
  await saveSnapshot(snapshot);

  await applyHandStats(seatIds(lineup.seats).filter((playerId) => !isTemporaryPlayerId(playerId)), {
    type: hand.type,
    winnerPlayerId: hand.winnerPlayerId,
    discarderPlayerId: hand.discarderPlayerId,
  });

  return {
    ok: true,
    nextVersion,
    nextHandIndex,
  };
}

export async function getRoomVersion(roomId: string): Promise<number | null> {
  const room = await getRoom(roomId);
  return room?.currentVersion ?? null;
}
