import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import HistoryScreen from '../../src/screens/HistoryScreen';
import { deleteGameCascade, listGames } from '../../src/db/repo';
import { deleteCloudArchive, listCloudArchives } from '../../src/db/cloudArchiveRepo';

jest.mock('../../src/db/repo', () => ({
  listGames: jest.fn(),
  deleteGameCascade: jest.fn(),
}));

jest.mock('../../src/db/cloudArchiveRepo', () => ({
  listCloudArchives: jest.fn(),
  deleteCloudArchive: jest.fn(),
}));

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string) => {
      const table: Record<string, string> = {
        'games.deleteGameAlert.title': '刪除對局紀錄',
        'games.deleteGameAlert.message': '確定要刪除呢場對局紀錄？此動作不能復原。',
        'games.deleteGameAlert.confirm': '刪除',
        'game.detail.action.cancel': '取消',
        'history.group.active': '進行中',
        'history.group.today': '今日',
        'history.group.yesterday': '昨日',
      };
      return table[key] ?? key;
    },
    language: 'zh-Hant',
  }),
}));

jest.mock('@react-navigation/native', () => {
  const ReactLib = require('react');
  return {
    useFocusEffect: (cb: () => void) => {
      ReactLib.useEffect(() => cb(), []);
    },
  };
});

jest.mock('react-native-gesture-handler/Swipeable', () => {
  return {
    __esModule: true,
    default: ({ children, renderRightActions }: { children: React.ReactNode; renderRightActions?: () => React.ReactNode }) => (
      <>
        {children}
        {renderRightActions ? renderRightActions() : null}
      </>
    ),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const mockedListGames = listGames as jest.MockedFunction<typeof listGames>;
const mockedDeleteGameCascade = deleteGameCascade as jest.MockedFunction<typeof deleteGameCascade>;
const mockedListCloudArchives = listCloudArchives as jest.MockedFunction<typeof listCloudArchives>;
const mockedDeleteCloudArchive = deleteCloudArchive as jest.MockedFunction<typeof deleteCloudArchive>;

const NOW = new Date('2025-01-02T12:00:00+08:00').getTime();

function makeGame(overrides: Record<string, unknown>) {
  return {
    id: 'g1',
    title: 'Test Game',
    createdAt: NOW,
    endedAt: NOW + 60 * 60 * 1000,
    handsCount: 1,
    resultStatus: 'result',
    resultSummaryJson: JSON.stringify({
      winnerText: 'A +10',
      loserText: 'B -10',
      playersCount: 4,
    }),
    currentRoundLabelZh: '東風東局',
    gameState: 'ended',
    ...overrides,
  } as any;
}

function makeArchive(overrides: Record<string, unknown>) {
  return {
    roomId: 'r1',
    title: 'Cloud Archive',
    createdAt: NOW,
    endedAt: NOW + 60 * 60 * 1000,
    archivedFromCloudAt: NOW + 60 * 60 * 1000,
    expiresAt: null,
    archiveVersion: 1,
    memberCount: 4,
    handCount: 2,
    ...overrides,
  } as any;
}

async function renderHistory() {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setOptions: jest.fn(),
  } as any;

  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <HistoryScreen navigation={navigation} route={{ key: 'k1', name: 'History' } as any} />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return { tree: tree!, navigation };
}

function textIndex(root: renderer.ReactTestInstance, text: string): number {
  return root.findAllByType(Text).findIndex((node) => {
    const children = node.props.children;
    return Array.isArray(children) ? children.join('') === text : children === text;
  });
}

describe('HistoryScreen delete confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockedListCloudArchives.mockResolvedValue([]);
    mockedDeleteCloudArchive.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows alert before deleting and deletes only after confirm', async () => {
    mockedListGames.mockResolvedValueOnce([
      makeGame({ id: 'g1', title: 'Test Game', createdAt: 1735689600000, endedAt: 1735693200000 }),
    ] as any);

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { tree } = await renderHistory();

    const root = tree.root;
    const deleteButton = root.findByProps({ testID: 'history-delete-g1' });

    await act(async () => {
      deleteButton.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0] as [string, string, Array<{ text: string; onPress?: () => void; style?: string }>];
    expect(title).toBe('刪除對局紀錄');
    expect(message).toBe('確定要刪除呢場對局紀錄？此動作不能復原。');

    const confirmButton = buttons.find((btn) => btn.text === '刪除');
    expect(confirmButton).toBeDefined();

    await act(async () => {
      await confirmButton?.onPress?.();
    });

    expect(mockedDeleteGameCascade).toHaveBeenCalledWith('g1');

    alertSpy.mockRestore();
    await act(async () => {
      tree.unmount();
    });
  });

  it('keeps local games visible when cloud archive loading fails', async () => {
    mockedListGames.mockResolvedValueOnce([
      makeGame({ id: 'g1', title: 'Local Game', createdAt: NOW - 60 * 60 * 1000 }),
    ] as any);
    mockedListCloudArchives.mockRejectedValueOnce(new Error('archive unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { tree } = await renderHistory();

    expect(textIndex(tree.root, 'Local Game')).toBeGreaterThanOrEqual(0);
    expect(textIndex(tree.root, 'Cloud Archive')).toBe(-1);

    await act(async () => {
      tree.unmount();
    });
  });

  it('groups local games and cloud archives by date in chronological sections', async () => {
    const yesterday = NOW - 24 * 60 * 60 * 1000;
    mockedListGames.mockResolvedValueOnce([
      makeGame({ id: 'g-yesterday', title: 'Yesterday Local', createdAt: yesterday + 60 * 60 * 1000 }),
    ] as any);
    mockedListCloudArchives.mockResolvedValueOnce([
      makeArchive({ roomId: 'r-today', title: 'Today Archive', createdAt: NOW - 30 * 60 * 1000 }),
      makeArchive({ roomId: 'r-yesterday', title: 'Yesterday Archive', createdAt: yesterday + 30 * 60 * 1000 }),
    ] as any);

    const { tree } = await renderHistory();
    const root = tree.root;

    const todayIndex = textIndex(root, '今日');
    const todayArchiveIndex = textIndex(root, 'Today Archive');
    const yesterdayIndex = textIndex(root, '昨日');
    const yesterdayLocalIndex = textIndex(root, 'Yesterday Local');
    const yesterdayArchiveIndex = textIndex(root, 'Yesterday Archive');

    expect(todayIndex).toBeGreaterThanOrEqual(0);
    expect(todayArchiveIndex).toBeGreaterThan(todayIndex);
    expect(yesterdayIndex).toBeGreaterThan(todayArchiveIndex);
    expect(yesterdayLocalIndex).toBeGreaterThan(yesterdayIndex);
    expect(yesterdayArchiveIndex).toBeGreaterThan(yesterdayLocalIndex);

    await act(async () => {
      tree.unmount();
    });
  });

  it('renders the canonical explicit-reseat winner and loser stored in the local result snapshot', async () => {
    mockedListGames.mockResolvedValueOnce([
      makeGame({
        id: 'explicit-reseat-history',
        title: 'Explicit Reseat History',
        resultSummaryJson: JSON.stringify({
          winnerText: 'North +HK$6',
          loserText: 'South -HK$6',
          playerTotalsQ: { p0: 16, p1: -24, p2: -16, p3: 24 },
          seatTotalsQ: [64, -32, -16, -16],
          playersCount: 4,
        }),
      }),
    ] as any);

    const { tree } = await renderHistory();
    const text = tree.root.findAllByType(Text).map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join('') : String(children);
    }).join('\n');

    expect(text).toContain('North +HK$6  ｜  South -HK$6');
    expect(text).not.toContain('North +HK$16');

    await act(async () => {
      tree.unmount();
    });
  });

  it('deletes a cloud archive without deleting local games', async () => {
    mockedListGames.mockResolvedValueOnce([
      makeGame({ id: 'g1', title: 'Local Game', createdAt: NOW - 60 * 60 * 1000 }),
    ] as any);
    mockedListCloudArchives.mockResolvedValueOnce([
      makeArchive({ roomId: 'r1', title: 'Cloud Archive', createdAt: NOW - 30 * 60 * 1000 }),
    ] as any);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { tree } = await renderHistory();
    const archiveDeleteButton = tree.root.findByProps({ testID: 'history-delete-archive-r1' });

    await act(async () => {
      archiveDeleteButton.props.onPress();
    });

    const [, , buttons] = alertSpy.mock.calls[0] as [string, string, Array<{ text: string; onPress?: () => void; style?: string }>];
    const confirmButton = buttons.find((btn) => btn.text === '刪除');

    await act(async () => {
      await confirmButton?.onPress?.();
    });

    expect(mockedDeleteCloudArchive).toHaveBeenCalledWith('r1');
    expect(mockedDeleteGameCascade).not.toHaveBeenCalled();
    expect(textIndex(tree.root, 'Local Game')).toBeGreaterThanOrEqual(0);

    alertSpy.mockRestore();
    await act(async () => {
      tree.unmount();
    });
  });
});
