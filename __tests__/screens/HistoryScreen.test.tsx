import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import HistoryScreen from '../../src/screens/HistoryScreen';
import { deleteGameCascade, listGames } from '../../src/db/repo';

jest.mock('../../src/db/repo', () => ({
  listGames: jest.fn(),
  deleteGameCascade: jest.fn(),
}));

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string) => {
      const table: Record<string, string> = {
        'games.deleteGameAlert.title': '刪除對局紀錄',
        'games.deleteGameAlert.message': '確定要刪除呢場對局紀錄？此動作不能復原。',
        'games.deleteGameAlert.confirm': '刪除',
        'game.detail.action.cancel': '取消',
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

describe('HistoryScreen delete confirm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows alert before deleting and deletes only after confirm', async () => {
    mockedListGames.mockResolvedValueOnce([
      {
        id: 'g1',
        title: 'Test Game',
        createdAt: 1735689600000,
        endedAt: 1735693200000,
        handsCount: 1,
        resultStatus: 'result',
        resultSummaryJson: JSON.stringify({
          winnerText: 'A +10',
          loserText: 'B -10',
          playersCount: 4,
        }),
        currentRoundLabelZh: '東風東局',
        gameState: 'ended',
      },
    ] as any);

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

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
    });

    const root = tree!.root;
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
      tree!.unmount();
    });
  });
});
