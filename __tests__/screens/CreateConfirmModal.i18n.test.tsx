import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import CreateConfirmModal from '../../src/screens/newGameStepper/sections/CreateConfirmModal';
import zhHant from '../../src/i18n/locales/zh-Hant.json';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => ReactLib.createElement(View, null, children),
  };
});

describe('CreateConfirmModal i18n', () => {
  it('does not render raw newGame.confirmModal keys', async () => {
    const labels = {
      title: zhHant['newGame.confirmModal.title'],
      subtitle: zhHant['newGame.confirmModal.subtitle'],
      sectionGame: zhHant['newGame.confirmModal.section.game'],
      sectionScoring: zhHant['newGame.confirmModal.section.scoring'],
      sectionPlayers: zhHant['newGame.confirmModal.section.players'],
      backToEdit: zhHant['newGame.confirmModal.action.backToEdit'],
      confirmCreate: zhHant['newGame.confirmModal.action.confirmCreate'],
      creating: zhHant['newGame.creating'],
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <CreateConfirmModal
          visible
          busy={false}
          labels={labels}
          sections={{
            game: [{ label: zhHant['newGame.confirmModal.field.title'], value: '測試局' }],
            scoring: [{ label: zhHant['newGame.confirmModal.field.minFan'], value: '3' }],
            players: [
              {
                label: `${zhHant['newGame.confirmModal.field.playersEast']} (${zhHant['newGame.dealerBadge']})`,
                value: '阿東',
              },
              { label: zhHant['newGame.confirmModal.field.playersSouth'], value: '阿南' },
              { label: zhHant['newGame.confirmModal.field.playersWest'], value: '阿西' },
              { label: zhHant['newGame.confirmModal.field.playersNorth'], value: '阿北' },
            ],
          }}
          onClose={jest.fn()}
          onConfirm={jest.fn()}
        />,
      );
    });

    const textContent = tree!.root
      .findAllByType(Text)
      .map((node) => String(node.props.children))
      .join('\n');

    expect(textContent).not.toContain('newGame.confirmModal.');

    await act(async () => {
      tree!.unmount();
    });
  });
});
