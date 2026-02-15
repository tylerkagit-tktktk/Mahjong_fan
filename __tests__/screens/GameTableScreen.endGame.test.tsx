import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import AppButton from '../../src/components/AppButton';
import GameTableScreen from '../../src/screens/GameTableScreen';
import { endGame, getGameBundle } from '../../src/db/repo';

jest.mock('../../src/db/repo', () => ({
  endGame: jest.fn(),
  getGameBundle: jest.fn(),
  insertHand: jest.fn(),
}));

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string) => key,
    language: 'zh-Hant',
    setLanguage: jest.fn(),
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

jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactLib.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const mockedGetGameBundle = getGameBundle as jest.MockedFunction<typeof getGameBundle>;
const mockedEndGame = endGame as jest.MockedFunction<typeof endGame>;

function createBundle() {
  return {
    game: {
      id: 'game-1',
      title: 'Game 1',
      createdAt: 1735689600000,
      currencySymbol: 'HK$',
      variant: 'HK',
      rulesJson: JSON.stringify({
        version: 1,
        variant: 'HK',
        mode: 'HK',
        currencyCode: 'HKD',
        currencySymbol: 'HK$',
        seats: { order: ['E', 'S', 'W', 'N'] },
        minFanToWin: 3,
        hk: {
          scoring: 'fan',
          scoringPreset: 'traditionalFan',
          gunMode: 'halfGun',
          stakePreset: 'TWO_FIVE_CHICKEN',
          capFan: 10,
          applyDealerMultiplier: false,
        },
        settlement: { mode: 'immediate' },
      }),
      startingDealerSeatIndex: 0,
      endedAt: null,
      gameState: 'active',
      handsCount: 0,
      progressIndex: 0,
      currentWindIndex: 0,
      currentRoundNumber: 1,
      maxWindIndex: 1,
      currentRoundLabelZh: '東風東局',
      resultStatus: null,
      resultSummaryJson: null,
      resultUpdatedAt: null,
      languageOverride: null,
    },
    players: [
      { id: 'p0', gameId: 'game-1', name: 'A', seatIndex: 0 },
      { id: 'p1', gameId: 'game-1', name: 'B', seatIndex: 1 },
      { id: 'p2', gameId: 'game-1', name: 'C', seatIndex: 2 },
      { id: 'p3', gameId: 'game-1', name: 'D', seatIndex: 3 },
    ],
    hands: [],
  };
}

describe('GameTableScreen end game flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetGameBundle.mockResolvedValue(createBundle() as any);
    mockedEndGame.mockResolvedValue();
  });

  it('replaces to GameDashboard after end game confirm', async () => {
    const navigation = {
      setOptions: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
      goBack: jest.fn(),
    } as any;

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameTableScreen navigation={navigation} route={{ key: 'k1', name: 'GameTable', params: { gameId: 'game-1' } } as any} />,
      );
      await Promise.resolve();
    });

    const endButton = tree!.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === 'gameTable.action.endGame');
    expect(endButton).toBeTruthy();

    await act(async () => {
      endButton!.props.onPress();
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const confirmButton = (buttons as Array<{ text: string; onPress?: () => void | Promise<void> }>).find(
      (button) => button.text === 'gameTable.endGame.confirm',
    );
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      await confirmButton!.onPress?.();
    });

    expect(mockedEndGame).toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('GameDashboard', { gameId: 'game-1' });

    alertSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });

  it('prevents double endGame trigger while ending is in-flight', async () => {
    const navigation = {
      setOptions: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
      goBack: jest.fn(),
    } as any;

    let resolveEndGame: (() => void) | null = null;
    mockedEndGame.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEndGame = resolve;
        }),
    );

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameTableScreen navigation={navigation} route={{ key: 'k1', name: 'GameTable', params: { gameId: 'game-1' } } as any} />,
      );
      await Promise.resolve();
    });

    const endButton = tree!.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === 'gameTable.action.endGame');

    await act(async () => {
      endButton!.props.onPress();
      endButton!.props.onPress();
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const confirmButton = (buttons as Array<{ text: string; onPress?: () => void | Promise<void> }>).find(
      (button) => button.text === 'gameTable.endGame.confirm',
    );

    await act(async () => {
      confirmButton!.onPress?.();
      confirmButton!.onPress?.();
    });

    expect(mockedEndGame).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveEndGame?.();
      await Promise.resolve();
    });

    alertSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });
});
