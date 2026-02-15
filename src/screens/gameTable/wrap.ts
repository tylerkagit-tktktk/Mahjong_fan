import { didCompleteWindCycle } from '../../models/seatRotation';
import AsyncStorage from '@react-native-async-storage/async-storage';

type WrapTokenInput = {
  gameId: string;
  handIndex: number;
  nextRoundLabelZh: string;
};

type WrapTokenIndexEntry = {
  gameId: string;
  updatedAt: number;
};

const WRAP_TOKEN_KEY_PREFIX = 'reseat:lastWrapToken';
const WRAP_TOKEN_INDEX_KEY = `${WRAP_TOKEN_KEY_PREFIX}:index`;
const WRAP_TOKEN_INDEX_MAX = 50;

export function isWrapEvent(previousRoundLabelZh: string, nextRoundLabelZh: string): boolean {
  return didCompleteWindCycle(previousRoundLabelZh, nextRoundLabelZh);
}

export function buildWrapToken({ gameId, handIndex, nextRoundLabelZh }: WrapTokenInput): string {
  return `${gameId}:${handIndex}:${nextRoundLabelZh}`;
}

export function shouldPromptReseat(storedToken: string | null | undefined, nextToken: string): boolean {
  return (storedToken ?? null) !== nextToken;
}

export function buildWrapTokenStorageKey(gameId: string): string {
  return `${WRAP_TOKEN_KEY_PREFIX}:${gameId}`;
}

export async function loadPersistedWrapToken(gameId: string): Promise<string | null> {
  return AsyncStorage.getItem(buildWrapTokenStorageKey(gameId));
}

export async function persistWrapToken(gameId: string, token: string, now = Date.now()): Promise<void> {
  const tokenKey = buildWrapTokenStorageKey(gameId);
  await AsyncStorage.setItem(tokenKey, token);

  let indexEntries: WrapTokenIndexEntry[] = [];
  try {
    const raw = await AsyncStorage.getItem(WRAP_TOKEN_INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) {
      indexEntries = parsed
        .filter((entry): entry is WrapTokenIndexEntry => {
          return (
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as WrapTokenIndexEntry).gameId === 'string' &&
            typeof (entry as WrapTokenIndexEntry).updatedAt === 'number'
          );
        });
    }
  } catch {
    indexEntries = [];
  }

  const nextEntries = [
    { gameId, updatedAt: now },
    ...indexEntries.filter((entry) => entry.gameId !== gameId),
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, WRAP_TOKEN_INDEX_MAX);
  const removed = indexEntries
    .filter((entry) => !nextEntries.some((next) => next.gameId === entry.gameId))
    .map((entry) => entry.gameId);

  await AsyncStorage.setItem(WRAP_TOKEN_INDEX_KEY, JSON.stringify(nextEntries));
  if (removed.length > 0) {
    await Promise.all(removed.map((staleGameId) => AsyncStorage.removeItem(buildWrapTokenStorageKey(staleGameId))));
  }
}
