import type {
  CloudArchivePayload,
  HandLog,
  RoomLineup,
  RoomMember,
  RoomTemporaryPlayer,
} from '../../src/models/cloud';
import type { RulesV1 } from '../../src/models/rules';
import { customRules, FIXED_CREATED_AT, traditionalRules } from './fixtures';

export const CLOUD_ROOM_ID = 'cloud-room-001';
export const CLOUD_PLAYER_IDS = {
  east: 'uid-east',
  south: 'uid-south',
  west: 'uid-west',
  north: 'uid-north',
  fifth: 'uid-fifth',
  temp: 'temp-player-x',
} as const;

const DEFAULT_SEATS = {
  '0': CLOUD_PLAYER_IDS.east,
  '1': CLOUD_PLAYER_IDS.south,
  '2': CLOUD_PLAYER_IDS.west,
  '3': CLOUD_PLAYER_IDS.north,
} as const;

export function cloudMember(uid: string, displayName: string, offset = 0): RoomMember {
  return {
    uid,
    roomId: CLOUD_ROOM_ID,
    role: uid === CLOUD_PLAYER_IDS.east ? 'host' : 'player',
    membershipStatus: 'active',
    joinedAt: FIXED_CREATED_AT + offset,
    displayName,
    avatarUrl: null,
  };
}

export function cloudTemporaryPlayer(
  tempPlayerId = CLOUD_PLAYER_IDS.temp,
  displayName = 'Temporary',
): RoomTemporaryPlayer {
  return {
    tempPlayerId,
    roomId: CLOUD_ROOM_ID,
    createdByUid: CLOUD_PLAYER_IDS.east,
    displayName,
    createdAt: FIXED_CREATED_AT + 50,
    updatedAt: FIXED_CREATED_AT + 50,
  };
}

export function cloudLineup(input: {
  lineupVersion: number;
  effectiveFromHandIndex: number;
  seats?: Record<'0' | '1' | '2' | '3', string>;
}): RoomLineup {
  return {
    lineupId: `lineup_${input.lineupVersion}`,
    roomId: CLOUD_ROOM_ID,
    effectiveFromHandIndex: input.effectiveFromHandIndex,
    seats: { ...(input.seats ?? DEFAULT_SEATS) },
    createdByUid: CLOUD_PLAYER_IDS.east,
    createdAt: FIXED_CREATED_AT + input.lineupVersion * 10,
    baseVersion: input.lineupVersion,
    lineupVersion: input.lineupVersion,
  };
}

export function cloudHand(input: {
  handIndex: number;
  type: 'zimo' | 'discard' | 'draw';
  lineupVersion?: number;
  handId?: string;
  winnerPlayerId?: string | null;
  discarderPlayerId?: string | null;
  dealerAction?: 'stick' | 'pass' | null;
  fan?: number;
}): HandLog {
  return {
    handId: input.handId ?? `source-hand-${input.handIndex}`,
    roomId: CLOUD_ROOM_ID,
    handIndex: input.handIndex,
    type: input.type,
    submittedByUid: CLOUD_PLAYER_IDS.east,
    baseVersion: input.handIndex + 1,
    serverVersion: input.handIndex + 2,
    lineupVersion: input.lineupVersion ?? 1,
    winnerPlayerId: input.type === 'draw' ? null : input.winnerPlayerId ?? CLOUD_PLAYER_IDS.east,
    discarderPlayerId: input.type === 'discard' ? input.discarderPlayerId ?? CLOUD_PLAYER_IDS.south : null,
    dealerAction: input.type === 'draw' ? input.dealerAction ?? 'stick' : null,
    fan: input.fan ?? 3,
    createdAt: FIXED_CREATED_AT + input.handIndex * 1_000,
  };
}

export function cloudRulesSnapshot(rules: RulesV1 = traditionalRules()): Record<string, unknown> {
  return { serializedRules: JSON.stringify(rules) };
}

export function createCloudArchiveFixture(input: {
  hands?: HandLog[];
  lineups?: RoomLineup[];
  members?: RoomMember[];
  tempPlayers?: RoomTemporaryPlayer[];
  rules?: RulesV1;
  roomOverrides?: Partial<CloudArchivePayload['room']>;
} = {}): CloudArchivePayload {
  const hands = input.hands ?? [];
  const lineups = input.lineups ?? [cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 })];
  const members = input.members ?? [
    cloudMember(CLOUD_PLAYER_IDS.east, 'East', 0),
    cloudMember(CLOUD_PLAYER_IDS.south, 'South', 1),
    cloudMember(CLOUD_PLAYER_IDS.west, 'West', 2),
    cloudMember(CLOUD_PLAYER_IDS.north, 'North', 3),
  ];
  const activeLineupVersion = lineups.reduce((max, lineup) => Math.max(max, lineup.lineupVersion), 0);
  return {
    room: {
      roomId: CLOUD_ROOM_ID,
      title: 'Cloud canonical fixture',
      hostUid: CLOUD_PLAYER_IDS.east,
      status: 'archived',
      maxSeats: 4,
      memberCap: 8,
      memberCount: members.length,
      currentVersion: 1 + lineups.length + hands.length,
      currentHandIndex: hands.length,
      activeLineupVersion,
      rulesSnapshot: cloudRulesSnapshot(input.rules ?? traditionalRules()),
      archiveReadyAt: FIXED_CREATED_AT + 100_000,
      expiresAt: FIXED_CREATED_AT + 200_000,
      archiveVersion: 1,
      createdAt: FIXED_CREATED_AT,
      updatedAt: FIXED_CREATED_AT + 100_000,
      ...input.roomOverrides,
    },
    members,
    tempPlayers: input.tempPlayers ?? [],
    lineups,
    hands,
    archivedFromCloudAt: FIXED_CREATED_AT + 100_000,
    archiveVersion: 1,
  };
}

export function createCustomCloudArchiveFixture(): CloudArchivePayload {
  return createCloudArchiveFixture({ rules: customRules({ unitPerFan: 0.5, capFan: 5 }) });
}

export function cloneCloudFixture<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
