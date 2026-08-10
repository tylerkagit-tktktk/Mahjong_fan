import { filterJoinedSyncPlayers } from '../../src/screens/newGameSyncHelpers';
import { ResolvedRoomPlayer } from '../../src/models/cloud';

function player(kind: ResolvedRoomPlayer['kind'], playerId: string, displayName: string): ResolvedRoomPlayer {
  return {
    playerId,
    roomId: 'room_qa_2b3',
    kind,
    uid: kind === 'member' ? playerId : null,
    displayName,
    avatarUrl: null,
    isHost: false,
    isSelf: false,
    joinedAt: Number(playerId.replace(/\D/g, '')) || 1,
  };
}

describe('new game synced-player setup', () => {
  it('keeps temporary players available for seat assignment', () => {
    const players = [
      player('member', 'member-1', 'Host-A'),
      player('temporary', 'temp-1', '測試玩家 A'),
      player('temporary', 'temp-2', '測試玩家 B'),
    ];

    expect(filterJoinedSyncPlayers(players)).toEqual(players);
  });
});
