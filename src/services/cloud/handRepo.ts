import { HandLog, RoomPlayerId, SubmitHandInput, SubmitResult } from '../../models/cloud';
import { getRoom } from './roomRepo';
import { getFirestore } from '../firebase/firebase';

const roomRef = (roomId: string) => getFirestore().collection('rooms').doc(roomId);
const handsRef = (roomId: string) => roomRef(roomId).collection('hands');
const lineupsRef = (roomId: string) => roomRef(roomId).collection('lineups');

function seatIds(seats: Record<'0' | '1' | '2' | '3', RoomPlayerId | null>): RoomPlayerId[] {
  return [seats['0'], seats['1'], seats['2'], seats['3']].filter((value): value is string => Boolean(value));
}

export async function listHands(roomId: string): Promise<HandLog[]> {
  const snapshot = await handsRef(roomId).orderBy('handIndex').get();
  return snapshot.docs.map((doc) => doc.data() as HandLog);
}

export async function submitHand(input: SubmitHandInput): Promise<SubmitResult> {
  const result = await getFirestore().runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef(input.roomId));
    if (!roomSnapshot.exists()) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found' } as SubmitResult;
    const room = roomSnapshot.data() as { currentVersion: number; currentHandIndex: number; activeLineupVersion: number; status: string; roomId: string };
    if (room.status !== 'active') return { ok: false, code: 'ROOM_ENDED', message: 'Room is not active', latestVersion: room.currentVersion } as SubmitResult;
    if (input.baseVersion !== room.currentVersion) return { ok: false, code: 'VERSION_CONFLICT', message: 'Version conflict', latestVersion: room.currentVersion } as SubmitResult;
    const lineupSnapshot = await transaction.get(lineupsRef(input.roomId).doc(String(room.activeLineupVersion)));
    if (!lineupSnapshot.exists()) return { ok: false, code: 'INVALID_LINEUP', message: 'No active lineup', latestVersion: room.currentVersion } as SubmitResult;
    const lineup = lineupSnapshot.data() as { lineupVersion: number; seats: Record<'0' | '1' | '2' | '3', RoomPlayerId | null> };
    const ids = seatIds(lineup.seats);
    if (!ids.includes(input.submittedByUid)) return { ok: false, code: 'NOT_IN_ACTIVE_LINEUP', message: 'Only active real player can submit', latestVersion: room.currentVersion } as SubmitResult;
    if (input.type !== 'draw' && (!input.winnerPlayerId || !ids.includes(input.winnerPlayerId))) return { ok: false, code: 'INVALID_LINEUP', message: 'Winner must be in active lineup', latestVersion: room.currentVersion } as SubmitResult;
    if (input.type === 'discard' && (!input.discarderPlayerId || !ids.includes(input.discarderPlayerId))) return { ok: false, code: 'INVALID_LINEUP', message: 'Discarder must be in active lineup', latestVersion: room.currentVersion } as SubmitResult;
    const nextVersion = room.currentVersion + 1;
    const nextHandIndex = room.currentHandIndex + 1;
    const hand: HandLog = {
      handId: String(nextHandIndex), roomId: input.roomId, handIndex: nextHandIndex, type: input.type,
      submittedByUid: input.submittedByUid, baseVersion: input.baseVersion, serverVersion: nextVersion,
      lineupVersion: lineup.lineupVersion, winnerPlayerId: input.winnerPlayerId ?? null,
      discarderPlayerId: input.discarderPlayerId ?? null, dealerAction: input.type === 'draw' ? input.dealerAction ?? 'stick' : null,
      fan: input.fan ?? 3, createdAt: Date.now(),
    };
    transaction.set(handsRef(input.roomId).doc(String(nextHandIndex)), hand);
    transaction.update(roomRef(input.roomId), { currentVersion: nextVersion, currentHandIndex: nextHandIndex, status: 'active', updatedAt: Date.now() });
    return { ok: true, nextVersion, nextHandIndex } as SubmitResult;
  });
  return result;
}

export async function getRoomVersion(roomId: string): Promise<number | null> {
  const room = await getRoom(roomId);
  return room?.currentVersion ?? null;
}
