import type { LocalGameReplayResult } from '../../services/localGameReplay';
import type { Game, GameBundle } from '../../models/db';

export type ReopenLocalGameInput = {
  gameId: string;
  expectedHandsCount: number;
  expectedLastHandId: string;
  expectedEndedAt: number;
  reason?: string | null;
};

export type LocalGameReopenErrorCode =
  | 'GAME_NOT_FOUND'
  | 'GAME_NOT_ENDED'
  | 'ABANDONED_GAME_CANNOT_REOPEN'
  | 'NO_HAND_TO_REOPEN'
  | 'STALE_REOPEN_TARGET'
  | 'CURRENT_TIMELINE_NOT_AUTHORITATIVE'
  | 'RESULT_SUMMARY_MISMATCH'
  | 'INVALID_TERMINAL_STATE';

export type LocalGameReopenPlan = {
  gameId: string;
  beforeGame: Game;
  afterGame: Game;
  handsCount: number;
  currentRoundLabelZh: string;
  reason: string | null;
};

export type LocalGameReopenPlanResult =
  | { ok: true; plan: LocalGameReopenPlan; issues: readonly [] }
  | { ok: false; plan: null; issues: readonly { code: LocalGameReopenErrorCode }[] };

function reject(code: LocalGameReopenErrorCode): LocalGameReopenPlanResult {
  return { ok: false, plan: null, issues: [{ code }] };
}

function hasEndedSummaryMismatch(replayResult: LocalGameReplayResult): boolean {
  return replayResult.parity?.items.some(
    (item) => item.field === 'endedResultSummary.source' && item.status === 'mismatch',
  ) ?? false;
}

/** Pure ended-to-active planner. It derives the active cache only from the authoritative replay. */
export function planReopenLocalGame(input: {
  bundle: GameBundle;
  replayResult: LocalGameReplayResult;
  action: ReopenLocalGameInput;
}): LocalGameReopenPlanResult {
  const { bundle, replayResult, action } = input;
  const { game } = bundle;
  if (game.id !== action.gameId) return reject('STALE_REOPEN_TARGET');
  if (game.gameState === 'abandoned') return reject('ABANDONED_GAME_CANNOT_REOPEN');
  if (game.gameState !== 'ended') return reject('GAME_NOT_ENDED');
  if (game.endedAt === null || game.endedAt === undefined || !Number.isFinite(game.endedAt)) {
    return reject('INVALID_TERMINAL_STATE');
  }
  const hands = bundle.hands.slice().sort((left, right) => left.handIndex - right.handIndex);
  if (hands.length === 0) return reject('NO_HAND_TO_REOPEN');
  const lastHand = hands[hands.length - 1];
  if (
    game.handsCount !== hands.length ||
    action.expectedHandsCount !== hands.length ||
    action.expectedLastHandId !== lastHand.id ||
    action.expectedEndedAt !== game.endedAt
  ) return reject('STALE_REOPEN_TARGET');
  if (hasEndedSummaryMismatch(replayResult)) return reject('RESULT_SUMMARY_MISMATCH');
  if (!replayResult.authoritative || !replayResult.replay?.isValid || !replayResult.replay.finalRound) {
    return reject('CURRENT_TIMELINE_NOT_AUTHORITATIVE');
  }

  const afterGame: Game = {
    ...game,
    gameState: 'active',
    endedAt: null,
    resultStatus: 'none',
    resultSummaryJson: null,
    resultUpdatedAt: null,
    handsCount: hands.length,
    currentRoundLabelZh: replayResult.replay.finalRound.nextRoundLabelZh,
  };
  return {
    ok: true,
    issues: [],
    plan: {
      gameId: game.id,
      beforeGame: { ...game },
      afterGame,
      handsCount: hands.length,
      currentRoundLabelZh: afterGame.currentRoundLabelZh ?? '',
      reason: action.reason ?? null,
    },
  };
}
