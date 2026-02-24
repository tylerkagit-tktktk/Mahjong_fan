import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import PlayersSection from '../../src/screens/newGameStepper/sections/PlayersSection';

function createNewGameProps() {
  return {
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
    onConfirmAutoSeat: jest.fn(),
    onStartingDealerModeChange: jest.fn(),
    onSelectStartingDealer: jest.fn(),
  };
}

describe('PlayersSection new game mode', () => {
  it('shows editable 4 player inputs and no rotation controls', async () => {
    const props = createNewGameProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<PlayersSection {...props} />);
    });

    const inputs = tree!.root.findAllByType(TextInput);
    expect(inputs).toHaveLength(4);
    expect(tree!.root.findAll((node) => String(node.props?.testID ?? '').startsWith('reseat-seat-picker-'))).toHaveLength(0);
  });
});
