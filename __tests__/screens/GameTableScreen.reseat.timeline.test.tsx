import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import AppButton from '../../src/components/AppButton';
import GameTableScreen from '../../src/screens/GameTableScreen';
import {
  getGameBundle,
  insertHand,
  updateGameSeatRotationOffset,
} from '../../src/db/repo';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../src/db/repo', () => ({
  getGameBundle: jest.fn(),
  insertHand: jest.fn(),
  endGame: jest.fn(),
  updateGameSeatRotationOffset: jest.fn(),
}));

const I18N_MAP: Record<string, string> = {
  'gameTable.action.draw': '流局',
  'gameTable.draw.title': '流局處理',
  'gameTable.draw.message': '請選擇流局處理方式',
  'gameTable.draw.cancel': '取消',
  'gameTable.draw.stick': '流局（番莊）',
  'gameTable.draw.pass': '流局（過莊）',
  'gameTable.reseat.promptTitle': '北風完，是否重新執位？',
  'gameTable.reseat.promptBody': '進入東風，是否重新執位？',
  'gameTable.reseat.action.skip': '唔需要',
  'gameTable.reseat.action.open': '要，重新執位',
  'gameTable.reseat.action.confirm': '套用執位',
  'gameTable.reseat.action.cancel': '取消',
  'gameTable.reseat.modalTitle': '重新執位',
  'gameTable.reseat.modalSubtitle': '調整東南西北座位',
  'gameTable.reseat.unsupported': '暫不支援此執位方式',
  'gameTable.handCount.started': '已打 {count} 鋪',
  'newGame.dealerBadge': '莊',
  'addHand.settlementType.discard': '點炮',
  'addHand.settlementType.zimo': '自摸',
  'addHand.save': '記錄此手',
  'addHand.title': '新增一手',
};

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string) => I18N_MAP[key] ?? key,
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

jest.mock('../../src/screens/newGameStepper/sections/PlayersSection', () => {
  const { Pressable: NativePressable, Text: NativeText, View } = require('react-native');
  return function MockPlayersSection(props: any) {
    return (
      <View>
        <NativeText>mock-players-section</NativeText>
        <NativePressable
          testID="rotate-seat-order"
          onPress={() => {
            props.onSetPlayer(0, 'B');
            props.onSetPlayer(1, 'C');
            props.onSetPlayer(2, 'D');
            props.onSetPlayer(3, 'A');
          }}
        >
          <NativeText>rotate</NativeText>
        </NativePressable>
      </View>
    );
  };
});

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStorage.delete(key);
    }),
  },
}));

const mockedGetGameBundle = getGameBundle as jest.MockedFunction<typeof getGameBundle>;
const mockedInsertHand = insertHand as jest.MockedFunction<typeof insertHand>;
const mockedUpdateSeatOffset = updateGameSeatRotationOffset as jest.MockedFunction<
  typeof updateGameSeatRotationOffset
>;
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function createBundle() {
  return {
    game: {
      id: 'game-1',
      title: 'Reseat Timeline',
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
          capFan: 13,
          applyDealerMultiplier: false,
        },
        settlement: { mode: 'immediate' },
      }),
      startingDealerSeatIndex: 0,
      endedAt: null,
      gameState: 'active',
      handsCount: 2,
      progressIndex: 0,
      currentWindIndex: 0,
      currentRoundNumber: 1,
      maxWindIndex: 1,
      currentRoundLabelZh: '北風北局',
      resultStatus: null,
      resultSummaryJson: null,
      resultUpdatedAt: null,
      languageOverride: null,
      seatRotationOffset: 0,
    },
    players: [
      { id: 'p0', gameId: 'game-1', name: 'A', seatIndex: 0 },
      { id: 'p1', gameId: 'game-1', name: 'B', seatIndex: 1 },
      { id: 'p2', gameId: 'game-1', name: 'C', seatIndex: 2 },
      { id: 'p3', gameId: 'game-1', name: 'D', seatIndex: 3 },
    ],
    hands: [
      {
        id: 'h0',
        gameId: 'game-1',
        handIndex: 0,
        dealerSeatIndex: 0,
        isDraw: false,
        winnerSeatIndex: 0,
        discarderSeatIndex: 1,
        winnerPlayerId: 'p0',
        discarderPlayerId: 'p1',
        type: 'fan',
        inputValue: 0,
        deltasJson: JSON.stringify({ unit: 'Q', values: [32, -16, -8, -8] }),
        computedJson: null,
        createdAt: 1735689600001,
        nextRoundLabelZh: '北風南局',
      },
      {
        id: 'h1',
        gameId: 'game-1',
        handIndex: 1,
        dealerSeatIndex: 0,
        isDraw: false,
        winnerSeatIndex: 0,
        discarderSeatIndex: 1,
        winnerPlayerId: 'p0',
        discarderPlayerId: 'p1',
        type: 'fan',
        inputValue: 0,
        deltasJson: JSON.stringify({ unit: 'Q', values: [16, -8, -4, -4] }),
        computedJson: null,
        createdAt: 1735689600002,
        nextRoundLabelZh: '北風北局',
      },
    ],
  };
}

function getAlertButtons(
  alertSpy: jest.SpyInstance,
  expectedTitle: string,
): Array<{ text: string; onPress?: () => void | Promise<void> }> {
  const call = alertSpy.mock.calls.find((args) => args[0] === expectedTitle);
  return (call?.[2] ?? []) as Array<{ text: string; onPress?: () => void | Promise<void> }>;
}

function getAmountStrings(tree: renderer.ReactTestRenderer): string[] {
  const textNodes = tree.root.findAll((node) => {
    if (typeof node.type !== 'string' || node.type !== 'Text') {
      return false;
    }
    const value = node.props.children;
    if (typeof value !== 'string') {
      return false;
    }
    return value.includes('HK$');
  });
  return textNodes.map((node) => String(node.props.children)).sort();
}

describe('GameTableScreen reseat timeline integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
    mockedGetGameBundle.mockResolvedValue(createBundle() as any);
    mockedUpdateSeatOffset.mockResolvedValue();
    let handCount = 2;
    mockedInsertHand.mockImplementation(async (input: any) => {
      const isDraw = Boolean(input.isDraw);
      const nextRoundLabelZh = isDraw ? '東風東局' : '東風南局';
      return {
        id: `h${handCount}`,
        gameId: 'game-1',
        handIndex: handCount++,
        dealerSeatIndex: input.dealerSeatIndex,
        isDraw,
        winnerSeatIndex: input.winnerSeatIndex ?? null,
        discarderSeatIndex: input.discarderSeatIndex ?? null,
        winnerPlayerId: input.winnerPlayerId ?? null,
        discarderPlayerId: input.discarderPlayerId ?? null,
        type: input.type,
        inputValue: input.inputValue ?? 0,
        deltasJson: input.deltasJson,
        computedJson: input.computedJson,
        createdAt: 1735689600000 + handCount,
        nextRoundLabelZh,
      };
    });
  });

  it('handles skip/confirm paths and keeps pre-reseat totals stable', async () => {
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
        <GameTableScreen
          navigation={navigation}
          route={{ key: 'k1', name: 'GameTable', params: { gameId: 'game-1' } } as any}
        />,
      );
      await Promise.resolve();
    });

    const baselineAmounts = getAmountStrings(tree!);

    const drawButton = tree!.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === '流局');
    expect(drawButton).toBeTruthy();

    await act(async () => {
      drawButton!.props.onPress();
    });
    let drawButtons = getAlertButtons(alertSpy, '流局處理');
    const passButton = drawButtons.find((button) => button.text === '流局（過莊）');
    expect(passButton).toBeTruthy();
    await act(async () => {
      await passButton?.onPress?.();
      await Promise.resolve();
    });

    let reseatButtons = getAlertButtons(alertSpy, '北風完，是否重新執位？');
    expect(reseatButtons.length).toBeGreaterThan(0);
    await act(async () => {
      reseatButtons.find((button) => button.text === '唔需要')?.onPress?.();
      await Promise.resolve();
    });
    expect(mockedUpdateSeatOffset).not.toHaveBeenCalled();
    expect(getAmountStrings(tree!)).toEqual(baselineAmounts);

    await act(async () => {
      tree!.update(
        <GameTableScreen
          navigation={navigation}
          route={{ key: 'k1', name: 'GameTable', params: { gameId: 'game-1' } } as any}
        />,
      );
      await Promise.resolve();
    });
    const reseatPromptCalls = alertSpy.mock.calls.filter((args) => args[0] === '北風完，是否重新執位？');
    expect(reseatPromptCalls).toHaveLength(1);

    await act(async () => {
      drawButton!.props.onPress();
    });
    drawButtons = getAlertButtons(alertSpy, '流局處理');
    const passButtonAgain = drawButtons.at(-1);
    await act(async () => {
      await passButtonAgain?.onPress?.();
      await Promise.resolve();
    });
    const reseatPromptCallsAfterSecondWrap = alertSpy.mock.calls.filter(
      (args) => args[0] === '北風完，是否重新執位？',
    );
    expect(reseatPromptCallsAfterSecondWrap).toHaveLength(2);

    reseatButtons = getAlertButtons(alertSpy, '北風完，是否重新執位？');
    await act(async () => {
      reseatButtons.find((button) => button.text === '要，重新執位')?.onPress?.();
      await Promise.resolve();
    });

    const rotateButton = tree!.root.findByProps({ testID: 'rotate-seat-order' });
    await act(async () => {
      rotateButton.props.onPress();
    });
    const confirmReseatButton = tree!.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === '套用執位');
    expect(confirmReseatButton).toBeTruthy();
    await act(async () => {
      await confirmReseatButton!.props.onPress();
      await Promise.resolve();
    });

    expect(mockedUpdateSeatOffset).toHaveBeenCalledTimes(1);
    expect(mockedUpdateSeatOffset).toHaveBeenCalledWith('game-1', 3);
    expect(getAmountStrings(tree!)).toEqual(baselineAmounts);

    await act(async () => {
      drawButton!.props.onPress();
    });
    drawButtons = getAlertButtons(alertSpy, '流局處理');
    const stickButton = drawButtons.at(-2);
    await act(async () => {
      await stickButton?.onPress?.();
      await Promise.resolve();
    });

    const insertSums = mockedInsertHand.mock.calls
      .map((call) => {
        const parsed = JSON.parse(call[0].deltasJson);
        return (parsed.values as number[]).reduce((sum, value) => sum + Number(value), 0);
      })
      .every((sum) => sum === 0);
    expect(insertSums).toBe(true);

    const renderedTree = JSON.stringify(tree!.toJSON());
    expect(renderedTree.includes('gameTable.reseat.')).toBe(false);

    alertSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });

  it('persists wrap token and does not re-prompt on remount for same wrap', async () => {
    const navigation = {
      setOptions: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
      goBack: jest.fn(),
    } as any;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    mockedInsertHand.mockResolvedValue({
      id: 'h2',
      gameId: 'game-1',
      handIndex: 2,
      dealerSeatIndex: 3,
      windIndex: 0,
      roundNumber: 1,
      isDraw: true,
      winnerSeatIndex: null,
      type: 'draw',
      winnerPlayerId: null,
      discarderPlayerId: null,
      inputValue: 0,
      deltasJson: JSON.stringify({ unit: 'Q', values: [0, 0, 0, 0] }),
      nextRoundLabelZh: '東風東局',
      computedJson: JSON.stringify({ source: 'draw', dealerAction: 'pass' }),
      createdAt: 1735689600003,
    } as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameTableScreen
          navigation={navigation}
          route={{ key: 'k1', name: 'GameTable', params: { gameId: 'game-1' } } as any}
        />,
      );
      await Promise.resolve();
    });

    const drawButton = tree!.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === '流局');
    await act(async () => {
      drawButton!.props.onPress();
    });
    const drawButtons = getAlertButtons(alertSpy, '流局處理');
    const passButton = drawButtons.find((button) => button.text === '流局（過莊）');
    await act(async () => {
      await passButton?.onPress?.();
      await Promise.resolve();
    });

    const promptCallsAfterFirstWrap = alertSpy.mock.calls.filter(
      (args) => args[0] === '北風完，是否重新執位？',
    );
    expect(promptCallsAfterFirstWrap).toHaveLength(1);

    await act(async () => {
      tree!.unmount();
    });

    await act(async () => {
      tree = renderer.create(
        <GameTableScreen
          navigation={navigation}
          route={{ key: 'k2', name: 'GameTable', params: { gameId: 'game-1' } } as any}
        />,
      );
      await Promise.resolve();
    });

    const drawButtonRemount = tree!.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === '流局');
    await act(async () => {
      drawButtonRemount!.props.onPress();
    });
    const drawButtonsRemount = getAlertButtons(alertSpy, '流局處理');
    const passButtonRemount = drawButtonsRemount.find((button) => button.text === '流局（過莊）');
    await act(async () => {
      await passButtonRemount?.onPress?.();
      await Promise.resolve();
    });

    const promptCallsAfterRemount = alertSpy.mock.calls.filter(
      (args) => args[0] === '北風完，是否重新執位？',
    );
    expect(promptCallsAfterRemount).toHaveLength(1);
    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
      'reseat:lastWrapToken:game-1',
      'game-1:2:東風東局',
    );

    alertSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });
});
