import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildWrapTokenStorageKey, persistWrapToken } from '../../src/screens/gameTable/wrap';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  },
}));

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('wrap token persistence cleanup', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('keeps only latest 50 game tokens and removes stale keys', async () => {
    for (let index = 1; index <= 55; index += 1) {
      await persistWrapToken(`g${index}`, `token-${index}`, index);
    }

    const rawIndex = mockStore.get('reseat:lastWrapToken:index');
    const entries = rawIndex ? (JSON.parse(rawIndex) as Array<{ gameId: string; updatedAt: number }>) : [];

    expect(entries).toHaveLength(50);
    expect(entries[0].gameId).toBe('g55');
    expect(entries[49].gameId).toBe('g6');
    expect(mockStore.has(buildWrapTokenStorageKey('g1'))).toBe(false);
    expect(mockStore.has(buildWrapTokenStorageKey('g5'))).toBe(false);
    expect(mockStore.has(buildWrapTokenStorageKey('g6'))).toBe(true);
    expect(mockStore.has(buildWrapTokenStorageKey('g55'))).toBe(true);
    expect(mockedStorage.removeItem).toHaveBeenCalled();
  });
});
