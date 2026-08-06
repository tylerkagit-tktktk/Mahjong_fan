import { getGameBundle } from '../db/repo';
import {
  adaptLocalGameBundle,
  createLocalAdapterDiagnostic,
  sortLocalAdapterDiagnostics,
  type LocalAdapterDiagnostic,
  type LocalGameRecordAdapterResult,
} from '../domain/gameRecord/localAdapter';
import { compareLocalReplayParity, type LocalReplayParityReport } from '../domain/gameRecord/localParity';
import { replayGameRecord } from '../domain/gameRecord/replay';
import type { ReplayResult } from '../domain/gameRecord/types';
import { isSchemaInitializationError } from '../db/schema';
import type { GameBundle } from '../models/db';

export type LocalGameReplayReadErrorCode = 'NOT_FOUND' | 'READ_FAILED';

export class LocalGameReplayReadError extends Error {
  readonly code: LocalGameReplayReadErrorCode;
  readonly gameId: string;
  readonly cause?: unknown;

  constructor(code: LocalGameReplayReadErrorCode, gameId: string, cause?: unknown) {
    super(code);
    this.name = 'LocalGameReplayReadError';
    this.code = code;
    this.gameId = gameId;
    this.cause = cause;
  }
}

export type LocalGameReplayResult = {
  adapter: LocalGameRecordAdapterResult | null;
  replay: ReplayResult | null;
  parity: LocalReplayParityReport | null;
  authoritative: boolean;
  readError: LocalGameReplayReadError | null;
};

function appendParityDiagnostics(
  adapter: LocalGameRecordAdapterResult,
  parity: LocalReplayParityReport,
): LocalGameRecordAdapterResult {
  if (!adapter.ok) {
    return adapter;
  }

  const hasPersistedSummaryMismatch = parity.items.some(
    (item) => item.field === 'endedResultSummary.source' && item.status === 'mismatch',
  );
  const alreadyReported = adapter.diagnostics.some(
    (diagnostic) => diagnostic.code === 'PERSISTED_RESULT_SUMMARY_MISMATCH',
  );
  if (!hasPersistedSummaryMismatch || alreadyReported) {
    return adapter;
  }

  const diagnostic: LocalAdapterDiagnostic = createLocalAdapterDiagnostic({
    code: 'PERSISTED_RESULT_SUMMARY_MISMATCH',
    severity: 'warning',
    gameId: adapter.snapshot.gameId,
    sourceField: 'game.resultSummaryJson',
    detail: 'persisted result summary differs from the current local projection',
  });
  return {
    ...adapter,
    diagnostics: sortLocalAdapterDiagnostics([...adapter.diagnostics, diagnostic]),
  };
}

function buildResult(
  adapter: LocalGameRecordAdapterResult,
  replay: ReplayResult | null,
  parity: LocalReplayParityReport | null,
): LocalGameReplayResult {
  const enrichedAdapter = replay && parity ? appendParityDiagnostics(adapter, parity) : adapter;
  const reliesOnInferredLegacyBoundary = enrichedAdapter.ok &&
    enrichedAdapter.snapshot.timeline.some((entry) => entry.entryType === 'seat-boundary') &&
    enrichedAdapter.diagnostics.some((diagnostic) => diagnostic.code === 'LEGACY_INFERRED_BOUNDARY_HISTORY');
  const authoritative = Boolean(
    enrichedAdapter.ok &&
    replay?.isValid &&
    parity?.requiredStatus === 'exact' &&
    !reliesOnInferredLegacyBoundary &&
    enrichedAdapter.diagnostics.every((diagnostic) => diagnostic.severity === 'info'),
  );
  return {
    adapter: enrichedAdapter,
    replay,
    parity,
    authoritative,
    readError: null,
  };
}

export function replayLocalGameBundle(bundle: GameBundle): LocalGameReplayResult {
  const adapter = adaptLocalGameBundle(bundle);
  if (!adapter.ok) {
    return buildResult(adapter, null, null);
  }

  const replay = replayGameRecord(adapter.snapshot);
  const parity = compareLocalReplayParity(bundle, replay);
  return buildResult(adapter, replay, parity);
}

function isGameNotFoundError(error: unknown, gameId: string): boolean {
  return error instanceof Error && (
    error.message === `Game not found: ${gameId}` ||
    error.message.includes(`Game not found: ${gameId}`)
  );
}

export async function loadAndReplayLocalGame(gameId: string): Promise<LocalGameReplayResult> {
  try {
    const bundle = await getGameBundle(gameId);
    return replayLocalGameBundle(bundle);
  } catch (error) {
    // Preserve schema initialization errors so callers retain the existing typed DB contract.
    if (isSchemaInitializationError(error)) {
      throw error;
    }
    const code: LocalGameReplayReadErrorCode = isGameNotFoundError(error, gameId)
      ? 'NOT_FOUND'
      : 'READ_FAILED';
    return {
      adapter: null,
      replay: null,
      parity: null,
      authoritative: false,
      readError: new LocalGameReplayReadError(code, gameId, error),
    };
  }
}
