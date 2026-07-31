import { importActiveGameBundle } from '../../db/repo';
import { computeHkSettlement, toAmountFromQ } from '../../domain/hk/settlement';
import { GameBundle, Hand } from '../../models/db';
import { RoomLineup, SeatKey } from '../../models/cloud';
import { getRoundLabel } from '../../models/dealer';
import { parseRules } from '../../models/rules';
import {
  buildSeatRotationOffsetsByHand,
  getBaseSeatForEffectiveSeat,
  getEffectiveSeatForPlayer,
} from '../../models/seatRotation';
import { INITIAL_ROUND_LABEL_ZH } from '../../constants/game';
import {
  ActiveRoomRecoverySnapshot,
  clearActiveHostedRoomPointer,
  clearActiveRoomRecoverySnapshot,
  loadActiveRoomRecoverySnapshot,
  loadLocalTakeoverGameId,
  saveLocalTakeoverGameId,
  savePendingHostedRoomCleanup,
} from './storage';

const SEAT_KEYS: SeatKey[] = ['0', '1', '2', '3'];

export type LocalTakeoverErrorCode =
  | 'NOT_HOST'
  | 'SNAPSHOT_INCOMPLETE'
  | 'PLAYER_SET_CHANGED'
  | 'INVALID_RULES';

export class LocalTakeoverError extends Error {
  constructor(readonly code: LocalTakeoverErrorCode) {
    super(code);
    this.name = 'LocalTakeoverError';
  }
}

type PendingHand = {
  hand: Hand;
  playerDeltaQ: Map<string, number>;
};

function requireFourPlayerIds(lineup: RoomLineup): string[] {
  const ids = SEAT_KEYS.map((seatKey) => lineup.seats[seatKey]);
  if (ids.some((playerId) => !playerId) || new Set(ids).size !== 4) {
    throw new LocalTakeoverError('SNAPSHOT_INCOMPLETE');
  }
  return ids as string[];
}

function samePlayerSet(left: string[], right: Set<string>): boolean {
  return left.length === right.size && left.every((playerId) => right.has(playerId));
}

function localGameId(roomId: string): string {
  return `local_takeover_${roomId}`;
}

function localPlayerId(gameId: string, playerId: string): string {
  return `${gameId}:player:${playerId}`;
}

function buildLineupByVersion(snapshot: ActiveRoomRecoverySnapshot): Map<number, RoomLineup> {
  const entries = [...(snapshot.lineups ?? [])];
  if (snapshot.lineup && !entries.some((lineup) => lineup.lineupVersion === snapshot.lineup?.lineupVersion)) {
    entries.push(snapshot.lineup);
  }
  return new Map(entries.map((lineup) => [lineup.lineupVersion, lineup]));
}

export function buildLocalTakeoverBundle(
  snapshot: ActiveRoomRecoverySnapshot,
  hostUid: string,
): GameBundle {
  const room = snapshot.room;
  const currentLineup = snapshot.lineup;
  const cloudPlayers = snapshot.players;
  const cloudHands = [...(snapshot.hands ?? [])].sort((a, b) => a.handIndex - b.handIndex);
  if (!room || !currentLineup || !cloudPlayers) {
    throw new LocalTakeoverError('SNAPSHOT_INCOMPLETE');
  }
  if (room.hostUid !== hostUid) {
    throw new LocalTakeoverError('NOT_HOST');
  }
  if (
    !Number.isInteger(room.currentHandIndex) ||
    cloudHands.length !== room.currentHandIndex ||
    !Number.isInteger(room.activeLineupVersion) ||
    currentLineup.lineupVersion !== room.activeLineupVersion
  ) {
    throw new LocalTakeoverError('SNAPSHOT_INCOMPLETE');
  }

  const serializedRules = room.rulesSnapshot.serializedRules;
  if (typeof serializedRules !== 'string') {
    throw new LocalTakeoverError('INVALID_RULES');
  }
  const rules = parseRules(serializedRules, 'HK');
  if (rules.mode !== 'HK' || !rules.hk) {
    throw new LocalTakeoverError('INVALID_RULES');
  }

  const currentPlayerIds = requireFourPlayerIds(currentLineup);
  const currentPlayerSet = new Set(currentPlayerIds);
  const cloudPlayerById = new Map(cloudPlayers.map((player) => [player.playerId, player] as const));
  if (currentPlayerIds.some((playerId) => !cloudPlayerById.has(playerId))) {
    throw new LocalTakeoverError('SNAPSHOT_INCOMPLETE');
  }

  const lineupByVersion = buildLineupByVersion(snapshot);
  if (cloudHands.some((hand, index) => hand.handIndex !== index + 1)) {
    throw new LocalTakeoverError('SNAPSHOT_INCOMPLETE');
  }
  const gameId = localGameId(room.roomId);
  const localIdByCloudId = new Map(
    currentPlayerIds.map((playerId) => [playerId, localPlayerId(gameId, playerId)] as const),
  );

  let dealerSeatIndex = 0;
  let dealerAdvanceCount = 0;
  const pendingHands: PendingHand[] = [];

  for (const [localHandIndex, cloudHand] of cloudHands.entries()) {
    const handLineup = lineupByVersion.get(cloudHand.lineupVersion);
    if (!handLineup) {
      throw new LocalTakeoverError('SNAPSHOT_INCOMPLETE');
    }
    const historicalPlayerIds = requireFourPlayerIds(handLineup);
    if (!samePlayerSet(historicalPlayerIds, currentPlayerSet)) {
      throw new LocalTakeoverError('PLAYER_SET_CHANGED');
    }

    const winnerSeatIndex = cloudHand.type === 'draw'
      ? null
      : historicalPlayerIds.indexOf(cloudHand.winnerPlayerId ?? '');
    const discarderSeatIndex = cloudHand.type === 'discard'
      ? historicalPlayerIds.indexOf(cloudHand.discarderPlayerId ?? '')
      : null;
    if (winnerSeatIndex !== null && winnerSeatIndex < 0) {
      throw new LocalTakeoverError('SNAPSHOT_INCOMPLETE');
    }
    if (discarderSeatIndex !== null && discarderSeatIndex < 0) {
      throw new LocalTakeoverError('SNAPSHOT_INCOMPLETE');
    }

    const roundBeforeHand = getRoundLabel(0, pendingHands.map((entry) => entry.hand));
    const playerDeltaQ = new Map<string, number>();
    let inputValue: number | null = null;
    let computed: Record<string, unknown>;

    if (cloudHand.type === 'draw') {
      historicalPlayerIds.forEach((playerId) => playerDeltaQ.set(playerId, 0));
      computed = {
        source: 'cloudTakeover',
        settlementType: 'draw',
        dealerAction: cloudHand.dealerAction ?? 'stick',
      };
    } else {
      const settlement = computeHkSettlement({
        rules,
        fan: cloudHand.fan ?? Math.max(1, rules.minFanToWin ?? 0),
        settlementType: cloudHand.type,
        winnerSeatIndex: winnerSeatIndex!,
        discarderSeatIndex,
      });
      historicalPlayerIds.forEach((playerId, seatIndex) => {
        playerDeltaQ.set(playerId, settlement.deltasQ[seatIndex]);
      });
      inputValue = toAmountFromQ(settlement.totalWinAmountQ);
      computed = {
        source: settlement.source,
        importedFromCloud: true,
        fan: cloudHand.fan ?? Math.max(1, rules.minFanToWin ?? 0),
        effectiveFan: settlement.effectiveFan,
        settlementType: cloudHand.type,
        discarderPaysQ: settlement.discarderPaysQ,
        othersPayQ: settlement.othersPayQ,
        totalWinAmountQ: settlement.totalWinAmountQ,
      };
    }

    const hand: Hand = {
      id: `${gameId}:hand:${cloudHand.handId || cloudHand.handIndex}`,
      gameId,
      handIndex: localHandIndex,
      dealerSeatIndex,
      windIndex: (roundBeforeHand.roundIndex - 1) % 4,
      roundNumber: dealerSeatIndex + 1,
      isDraw: cloudHand.type === 'draw',
      winnerSeatIndex,
      type: cloudHand.type === 'draw' ? 'draw' : 'fan',
      winnerPlayerId: cloudHand.winnerPlayerId
        ? localIdByCloudId.get(cloudHand.winnerPlayerId) ?? null
        : null,
      discarderPlayerId: cloudHand.discarderPlayerId
        ? localIdByCloudId.get(cloudHand.discarderPlayerId) ?? null
        : null,
      inputValue,
      deltasJson: null,
      nextRoundLabelZh: null,
      computedJson: JSON.stringify(computed),
      createdAt: cloudHand.createdAt,
    };
    pendingHands.push({ hand, playerDeltaQ });
    hand.nextRoundLabelZh = getRoundLabel(0, pendingHands.map((entry) => entry.hand)).labelZh;

    const nextDealer = cloudHand.type === 'draw'
      ? cloudHand.dealerAction === 'pass'
        ? (dealerSeatIndex + 1) % 4
        : dealerSeatIndex
      : winnerSeatIndex === dealerSeatIndex
        ? dealerSeatIndex
        : (dealerSeatIndex + 1) % 4;
    if (nextDealer !== dealerSeatIndex) dealerAdvanceCount += 1;
    dealerSeatIndex = nextDealer;
  }

  const offsetsByHand = buildSeatRotationOffsetsByHand(
    pendingHands.map((entry) => entry.hand),
    INITIAL_ROUND_LABEL_ZH,
    0,
  );
  const currentOffset = Math.floor(dealerAdvanceCount / 16) % 4;
  const baseSeatByPlayerId = new Map<string, number>();
  currentPlayerIds.forEach((playerId, currentSeatIndex) => {
    baseSeatByPlayerId.set(playerId, getBaseSeatForEffectiveSeat(currentSeatIndex, currentOffset));
  });

  const hands = pendingHands.map(({ hand, playerDeltaQ }, handIndex) => {
    const deltasQ = [0, 0, 0, 0];
    for (const playerId of currentPlayerIds) {
      const baseSeat = baseSeatByPlayerId.get(playerId)!;
      const effectiveSeat = getEffectiveSeatForPlayer(baseSeat, offsetsByHand[handIndex] ?? 0);
      deltasQ[effectiveSeat] = playerDeltaQ.get(playerId) ?? 0;
    }
    return {
      ...hand,
      deltasJson: JSON.stringify({ unit: 'Q', values: deltasQ }),
    };
  });

  const finalRound = getRoundLabel(0, hands);
  return {
    game: {
      id: gameId,
      title: room.title,
      createdAt: room.createdAt,
      currencySymbol: rules.currencySymbol,
      variant: 'HK',
      rulesJson: serializedRules,
      startingDealerSeatIndex: 0,
      progressIndex: dealerAdvanceCount,
      currentWindIndex: (finalRound.roundIndex - 1) % 4,
      currentRoundNumber: dealerSeatIndex + 1,
      maxWindIndex: 3,
      seatRotationOffset: currentOffset,
      gameState: hands.length > 0 ? 'active' : 'draft',
      currentRoundLabelZh: finalRound.labelZh,
      endedAt: null,
      handsCount: hands.length,
      resultStatus: 'none',
      resultSummaryJson: null,
      resultUpdatedAt: null,
      languageOverride: null,
    },
    players: currentPlayerIds.map((playerId) => ({
      id: localIdByCloudId.get(playerId)!,
      gameId,
      name: cloudPlayerById.get(playerId)!.displayName,
      seatIndex: baseSeatByPlayerId.get(playerId)!,
    })),
    hands,
  };
}

export async function abandonSyncAndCreateLocalGame(roomId: string, hostUid: string): Promise<string> {
  const existingGameId = await loadLocalTakeoverGameId(roomId);
  if (existingGameId) return existingGameId;

  const snapshot = await loadActiveRoomRecoverySnapshot(roomId);
  if (!snapshot) throw new LocalTakeoverError('SNAPSHOT_INCOMPLETE');
  const bundle = buildLocalTakeoverBundle(snapshot, hostUid);
  await importActiveGameBundle(bundle);
  await saveLocalTakeoverGameId(roomId, bundle.game.id);
  await savePendingHostedRoomCleanup({
    uid: hostUid,
    roomId,
    localGameId: bundle.game.id,
    createdAt: Date.now(),
  });
  await clearActiveHostedRoomPointer({ uid: hostUid, roomId });
  await clearActiveRoomRecoverySnapshot(roomId);
  return bundle.game.id;
}
