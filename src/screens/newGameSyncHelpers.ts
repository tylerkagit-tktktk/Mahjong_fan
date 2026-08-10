import { ResolvedRoomPlayer } from '../models/cloud';

export function filterJoinedSyncPlayers(players: readonly ResolvedRoomPlayer[]): ResolvedRoomPlayer[] {
  return players.filter((player) => player.kind === 'member' || player.kind === 'temporary');
}
