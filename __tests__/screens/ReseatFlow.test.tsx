import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import AppButton from '../../src/components/AppButton';
import ReseatFlow from '../../src/screens/gameTable/ReseatFlow';
import { getEffectivePlayersBySeat } from '../../src/models/seatRotation';
import { Player } from '../../src/models/db';

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string) => key,
    language: 'zh-Hant',
    setLanguage: jest.fn(),
  }),
}));

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

describe('ReseatFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseProps = {
    visible: true,
    currentRoundLabelZh: '東風東局',
    handsCount: 4,
    currentDealerSeatIndex: 0,
    currentPlayersBySeat: [
      { id: 'p0', name: 'A' },
      { id: 'p1', name: 'B' },
      { id: 'p2', name: 'C' },
      { id: 'p3', name: 'D' },
    ],
    onDismiss: jest.fn(),
    onApplyReseat: jest.fn().mockResolvedValue(undefined),
  };

  it('triggers wrap prompt once per visible session', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ReseatFlow {...baseProps} />);
      await Promise.resolve();
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.update(<ReseatFlow {...baseProps} />);
      await Promise.resolve();
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.update(<ReseatFlow {...baseProps} visible={false} />);
      await Promise.resolve();
    });
    await act(async () => {
      tree!.update(<ReseatFlow {...baseProps} visible />);
      await Promise.resolve();
    });
    expect(alertSpy).toHaveBeenCalledTimes(2);

    alertSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });

  it('choosing skip dismisses and does not apply mapping', async () => {
    const onDismiss = jest.fn();
    const onApplyReseat = jest.fn().mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ReseatFlow {...baseProps} onDismiss={onDismiss} onApplyReseat={onApplyReseat} />);
      await Promise.resolve();
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const skip = (buttons as Array<{ text: string; onPress?: () => void }>).find(
      (item) => item.text === 'gameTable.reseat.action.skip',
    );
    expect(skip).toBeTruthy();
    await act(async () => {
      skip?.onPress?.();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onApplyReseat).not.toHaveBeenCalled();

    alertSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });

  it('choosing open then confirm applies reseat delta', async () => {
    const onDismiss = jest.fn();
    const onApplyReseat = jest.fn().mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ReseatFlow {...baseProps} onDismiss={onDismiss} onApplyReseat={onApplyReseat} />);
      await Promise.resolve();
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const open = (buttons as Array<{ text: string; onPress?: () => void }>).find(
      (item) => item.text === 'gameTable.reseat.action.open',
    );
    await act(async () => {
      open?.onPress?.();
      await Promise.resolve();
    });

    const rotateButton = tree!.root.findByProps({ testID: 'rotate-seat-order' });
    await act(async () => {
      rotateButton.props.onPress();
    });

    const confirmButton = tree!.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === 'gameTable.reseat.action.confirm');
    expect(confirmButton).toBeTruthy();
    await act(async () => {
      await confirmButton!.props.onPress();
    });

    expect(onApplyReseat).toHaveBeenCalledTimes(1);
    expect(onApplyReseat).toHaveBeenCalledWith({ rotationDelta: 3 });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    alertSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });

  it('reseat only affects post-reseat hands totals', () => {
    const players: Player[] = [
      { id: 'p0', gameId: 'g1', name: 'A', seatIndex: 0 },
      { id: 'p1', gameId: 'g1', name: 'B', seatIndex: 1 },
      { id: 'p2', gameId: 'g1', name: 'C', seatIndex: 2 },
      { id: 'p3', gameId: 'g1', name: 'D', seatIndex: 3 },
    ];
    const preReseatHands = [
      [8, -4, -2, -2],
      [-4, 8, -2, -2],
    ];
    const postReseatHands = [
      [4, -4, 0, 0],
      [0, 4, -2, -2],
    ];

    const aggregate = (handDeltas: number[][], offsetByHand: number[]) => {
      const totals = new Map(players.map((player) => [player.id, 0]));
      handDeltas.forEach((deltasQ, handIndex) => {
        const bySeat = getEffectivePlayersBySeat(players, offsetByHand[handIndex] ?? 0);
        deltasQ.forEach((deltaQ, seatIndex) => {
          const player = bySeat[seatIndex];
          if (!player) {
            return;
          }
          totals.set(player.id, (totals.get(player.id) ?? 0) + deltaQ);
        });
      });
      return totals;
    };

    const preTotalsBeforeReseat = aggregate(preReseatHands, [0, 0]);
    const preTotalsAfterReseatApplied = aggregate(preReseatHands, [0, 0]);
    expect(preTotalsAfterReseatApplied).toEqual(preTotalsBeforeReseat);

    const allHands = [...preReseatHands, ...postReseatHands];
    const withReseat = aggregate(allHands, [0, 0, 1, 1]);
    const withoutReseat = aggregate(allHands, [0, 0, 0, 0]);

    expect(withReseat).not.toEqual(withoutReseat);
    expect(withReseat.get('p0')).toBe(4);
    expect(withReseat.get('p1')).toBe(2);
    expect(withReseat.get('p2')).toBe(-6);
    expect(withReseat.get('p3')).toBe(0);

    const totalQ = Array.from(withReseat.values()).reduce((sum, value) => sum + value, 0);
    expect(totalQ).toBe(0);
  });
});
