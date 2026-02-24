import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';
import PlayersSection from '../../src/screens/newGameStepper/sections/PlayersSection';

function createBaseProps() {
  return {
    allowNameEdit: true,
    seatMode: 'manual' as const,
    seatLabels: ['東', '南', '西', '北'],
    players: ['A', 'B', 'C', 'D'],
    autoNames: ['A', 'B', 'C', 'D'],
    autoAssigned: null,
    startingDealerMode: 'manual' as const,
    startingDealerSourceIndex: 0,
    playersError: null,
    disabled: false,
    manualPlayerRefs: { current: [] as Array<TextInput | null> },
    autoPlayerRefs: { current: [] as Array<TextInput | null> },
    labels: {
      sectionTitle: 'players',
      seatModeTitle: 'seat mode',
      seatModeManual: 'manual',
      seatModeAuto: 'auto',
      playerManualHintPrefix: 'prefix',
      playerManualHintSuffix: 'suffix',
      playerAutoHintPrefix: 'auto prefix',
      playerAutoHintSuffix: 'auto suffix',
      playerNameBySeatSuffix: ' player',
      playerOrderPrefix: 'P',
      playerOrderSuffix: '',
      autoSeatConfirm: 'confirm',
      autoSeatReshuffle: 'reshuffle',
      autoSeatResult: 'result',
      autoSeatResultManualTitle: 'result manual',
      autoSeatResultHint: 'hint',
      autoSeatDealerExample: 'dealer {dealerSeatLabel} {dealerPlayerName} {southSeatLabel} {southPlayerName}',
      manualSeatCaption: 'caption',
      startingDealerModeRandom: 'random',
      startingDealerModeManual: 'manual dealer',
      autoFlowHint: 'flow hint',
      dealerBadge: '莊',
    },
    onSeatModeChange: jest.fn(),
    onSetPlayer: jest.fn(),
    onSetAutoName: jest.fn(),
    lockedSeatByRow: [0, 1, 2, 3],
    onSelectLockedSeat: jest.fn(),
    onConfirmAutoSeat: jest.fn(),
    onStartingDealerModeChange: jest.fn(),
    onSelectStartingDealer: jest.fn(),
  };
}

describe('PlayersSection reseat name edit lock', () => {
  it('allows editing names in normal reseat mode', async () => {
    const props = createBaseProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<PlayersSection {...props} />);
    });

    const inputs = tree!.root.findAllByType(TextInput);
    expect(inputs).toHaveLength(4);
    expect(tree!.root.findAllByProps({ testID: 'reseat-seat-picker-0' })).toHaveLength(0);

    await act(async () => {
      inputs[0].props.onChangeText('AA');
    });
    expect(props.onSetPlayer).toHaveBeenCalledWith(0, 'AA');
  });

  it('locks name editing after full-wrap reseat and allows selecting seat tags', async () => {
    const props = createBaseProps();
    props.allowNameEdit = false;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<PlayersSection {...props} />);
    });

    const inputs = tree!.root.findAllByType(TextInput);
    expect(inputs).toHaveLength(0);

    const seatPicker = tree!.root.findByProps({ testID: 'reseat-seat-picker-0' });

    await act(async () => {
      seatPicker.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const optionButtons = alertSpy.mock.calls[0]?.[2] as Array<{ text: string; onPress?: () => void }>;
    expect(optionButtons).toHaveLength(4);
    await act(async () => {
      optionButtons[1]?.onPress?.();
    });
    expect(props.onSelectLockedSeat).toHaveBeenCalledWith(0, 1);
    alertSpy.mockRestore();
  });
});
