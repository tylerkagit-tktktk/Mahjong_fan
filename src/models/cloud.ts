export type CloudProvider = 'apple' | 'google';

export type CloudUserProfile = {
  uid: string;
  provider: CloudProvider;
  displayName: string;
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ProfileStats = {
  uid: string;
  handsParticipated: number;
  wins: number;
  zimoCount: number;
  discardCount: number;
  drawCount: number;
  updatedAt: number;
};

export type RoomStatus = 'open' | 'active' | 'ended' | 'archived';
export type MembershipStatus = 'active' | 'left';
export type RoomPlayerId = string;
export type SeatKey = '0' | '1' | '2' | '3';

export type Room = {
  roomId: string;
  title: string;
  hostUid: string;
  status: RoomStatus;
  maxSeats: 4;
  memberCap: number;
  currentVersion: number;
  currentHandIndex: number;
  activeLineupVersion: number;
  inviteTokenHash: string;
  inviteExpiresAt: number;
  rulesSnapshot: Record<string, unknown>;
  archiveReadyAt?: number | null;
  expiresAt?: number | null;
  archiveVersion?: number | null;
  createdAt: number;
  updatedAt: number;
};

export type RoomMember = {
  uid: string;
  roomId: string;
  role: 'host' | 'player';
  membershipStatus: MembershipStatus;
  joinedAt: number;
  displayName: string;
  avatarUrl: string | null;
};

export type RoomTemporaryPlayer = {
  tempPlayerId: string;
  roomId: string;
  createdByUid: string;
  displayName: string;
  createdAt: number;
  updatedAt: number;
};

export type ResolvedRoomPlayer = {
  playerId: RoomPlayerId;
  roomId: string;
  kind: 'member' | 'temporary';
  uid: string | null;
  displayName: string;
  avatarUrl: string | null;
  isHost: boolean;
  isSelf: boolean;
  joinedAt: number;
};

export type RoomLineup = {
  lineupId: string;
  roomId: string;
  effectiveFromHandIndex: number;
  seats: Record<SeatKey, RoomPlayerId | null>;
  createdByUid: string;
  createdAt: number;
  baseVersion: number;
  lineupVersion: number;
};

export type SubmitHandInput = {
  roomId: string;
  submittedByUid: string;
  type: 'zimo' | 'discard' | 'draw';
  baseVersion: number;
  winnerPlayerId?: RoomPlayerId | null;
  discarderPlayerId?: RoomPlayerId | null;
  dealerAction?: 'stick' | 'pass' | null;
  fan?: number;
};

export type SubmitResult =
  | { ok: true; nextVersion: number; nextHandIndex: number }
  | {
      ok: false;
      code:
        | 'VERSION_CONFLICT'
        | 'NOT_IN_ACTIVE_LINEUP'
        | 'LINEUP_CHANGE_WINDOW_CLOSED'
        | 'INVITE_EXPIRED'
        | 'ROOM_FULL'
        | 'ROOM_ENDED'
        | 'ROOM_NOT_FOUND'
        | 'INVALID_LINEUP'
        | 'NEED_MORE_REAL_PLAYERS'
        | 'ROOM_NOT_OPEN';
      message: string;
      latestVersion?: number;
    };

export type HandLog = {
  handId: string;
  roomId: string;
  handIndex: number;
  type: 'zimo' | 'discard' | 'draw';
  submittedByUid: string;
  baseVersion: number;
  serverVersion: number;
  lineupVersion: number;
  winnerPlayerId?: RoomPlayerId | null;
  discarderPlayerId?: RoomPlayerId | null;
  dealerAction?: 'stick' | 'pass' | null;
  fan?: number;
  createdAt: number;
};

export type LineupChangeInput = {
  roomId: string;
  createdByUid: string;
  baseVersion: number;
  nextSeats: Record<SeatKey, RoomPlayerId>;
};

export type StartRoomInput = {
  roomId: string;
  startedByUid: string;
  baseVersion: number;
  nextSeats: Record<SeatKey, RoomPlayerId>;
};

export type CloudSession = {
  uid: string;
  provider: CloudProvider;
};

export type CloudArchivePayload = {
  room: Room;
  members: RoomMember[];
  tempPlayers: RoomTemporaryPlayer[];
  lineups: RoomLineup[];
  hands: HandLog[];
  archivedFromCloudAt: number;
  archiveVersion: number;
};

export type CloudArchiveSummary = {
  roomId: string;
  title: string;
  createdAt: number;
  endedAt: number;
  archivedFromCloudAt: number;
  expiresAt: number | null;
  archiveVersion: number;
  memberCount: number;
  handCount: number;
};

export type CloudArchiveSync = {
  roomId: string;
  actorUid: string;
  archiveVersion: number;
  syncedAt: number;
};

export type CloudSnapshot = {
  rooms: Room[];
  members: RoomMember[];
  tempPlayers: RoomTemporaryPlayer[];
  lineups: RoomLineup[];
  hands: HandLog[];
  profiles: CloudUserProfile[];
  stats: ProfileStats[];
  archiveSyncs: CloudArchiveSync[];
};
