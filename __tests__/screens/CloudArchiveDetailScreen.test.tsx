import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import CloudArchiveDetailScreen from '../../src/screens/cloud/CloudArchiveDetailScreen';
import { loadArchivedGame } from '../../src/services/cloud/archiveRepo';

jest.mock('../../src/services/cloud/archiveRepo', () => ({
  loadArchivedGame: jest.fn(),
}));

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const table: Record<string, string> = {
        'common.back': '返回',
        'game.detail.header.title': '對局總結',
        'game.detail.header.statusEnded': '已結束',
        'game.detail.header.handsPlayed': '已打 {count} 鋪',
        'game.detail.loading': '載入中…',
        'game.detail.players.title': '玩家排名',
        'game.detail.rules.currency': '幣別',
        'game.detail.rules.hkCapFan': '爆棚',
        'game.detail.rules.hkGunMode': '銃制',
        'game.detail.rules.hkGunMode.fullGun': '全銃',
        'game.detail.rules.hkPreset': '計分模式',
        'game.detail.rules.hkPreset.traditionalFan': '傳統番數',
        'game.detail.rules.hkStake': '注碼',
        'game.detail.rules.hkStake.twoFiveChicken': '二五雞',
        'game.detail.rules.minFan': '最低番數',
        'game.detail.rules.title': '規則摘要',
        'game.detail.rules.variant': '牌型',
        'newGame.mode.hk': '香港',
      };
      const base = table[key] ?? key;
      if (!values) {
        return base;
      }
      return Object.entries(values).reduce(
        (result, [token, value]) => result.replace(`{${token}}`, String(value)),
        base,
      );
    },
    language: 'zh-Hant',
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactLib.createElement(View, null, children),
  };
});

const mockedLoadArchivedGame = loadArchivedGame as jest.MockedFunction<typeof loadArchivedGame>;

function createArchivePayload() {
  const createdAt = new Date('2026-04-24T06:00:00.000Z').getTime();
  return {
    room: {
      roomId: 'room-1',
      title: 'Ref',
      hostUid: 'uid-1',
      status: 'archived',
      maxSeats: 4,
      memberCap: 4,
      currentVersion: 3,
      currentHandIndex: 1,
      activeLineupVersion: 1,
      inviteTokenHash: '',
      inviteExpiresAt: 0,
      rulesSnapshot: {
        serializedRules: JSON.stringify({
          version: 1,
          variant: 'HK',
          mode: 'HK',
          languageDefault: 'zh-Hant',
          currencyCode: 'HKD',
          currencySymbol: 'HK$',
          seats: { order: ['E', 'S', 'W', 'N'] },
          settlement: { mode: 'immediate' },
          minFanToWin: 3,
          hk: {
            scoring: 'fan',
            scoringPreset: 'traditionalFan',
            gunMode: 'fullGun',
            stakePreset: 'TWO_FIVE_CHICKEN',
            unitPerFan: 1,
            capFan: 10,
            applyDealerMultiplier: true,
          },
        }),
      },
      archiveReadyAt: createdAt,
      expiresAt: null,
      archiveVersion: 1,
      createdAt,
      updatedAt: createdAt,
    },
    members: [
      { uid: 'uid-1', roomId: 'room-1', role: 'host', membershipStatus: 'active', joinedAt: createdAt, displayName: '12232', avatarUrl: null },
      { uid: 'uid-2', roomId: 'room-1', role: 'player', membershipStatus: 'active', joinedAt: createdAt + 1, displayName: '32', avatarUrl: null },
      { uid: 'uid-3', roomId: 'room-1', role: 'player', membershipStatus: 'active', joinedAt: createdAt + 2, displayName: 'Fb', avatarUrl: null },
      { uid: 'uid-4', roomId: 'room-1', role: 'player', membershipStatus: 'active', joinedAt: createdAt + 3, displayName: '2s', avatarUrl: null },
    ],
    tempPlayers: [],
    lineups: [
      {
        lineupId: 'lineup-1',
        roomId: 'room-1',
        effectiveFromHandIndex: 0,
        seats: { '0': 'uid-1', '1': 'uid-2', '2': 'uid-3', '3': 'uid-4' },
        createdByUid: 'uid-1',
        createdAt,
        baseVersion: 1,
        lineupVersion: 1,
      },
    ],
    hands: [
      {
        handId: 'hand-1',
        roomId: 'room-1',
        handIndex: 0,
        type: 'discard',
        submittedByUid: 'uid-1',
        baseVersion: 2,
        serverVersion: 3,
        lineupVersion: 1,
        winnerPlayerId: 'uid-2',
        discarderPlayerId: 'uid-1',
        fan: 3,
        createdAt,
      },
    ],
    archivedFromCloudAt: createdAt,
    archiveVersion: 1,
  } as any;
}

async function renderScreen() {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <CloudArchiveDetailScreen
        navigation={{ goBack: jest.fn(), setOptions: jest.fn() } as any}
        route={{ key: 'k1', name: 'CloudArchiveDetail', params: { roomId: 'room-1' } } as any}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree!;
}

function textContent(root: renderer.ReactTestInstance): string {
  return root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join('') : String(children);
    })
    .join('\n');
}

describe('CloudArchiveDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadArchivedGame.mockResolvedValue(createArchivePayload());
  });

  it('renders cloud archive with single-player game summary layout', async () => {
    const tree = await renderScreen();
    const text = textContent(tree.root);

    expect(text).toContain('對局總結');
    expect(text).toContain('已結束');
    expect(text).toContain('Ref');
    expect(text).toContain('東風南局 · 已打 1 鋪');
    expect(text).toContain('24/04/2026');
    expect(text).toContain('玩家排名');
    expect(text).toContain('32');
    expect(text).toContain('+HK$8');
    expect(text).toContain('12232');
    expect(text).toContain('-HK$8');
    expect(text).toContain('規則摘要');
    expect(text).toContain('牌型：香港 (HK)');
    expect(text).toContain('最低番數：3');
    expect(text).toContain('計分模式：傳統番數');
    expect(text).toContain('銃制：全銃');
    expect(text).toContain('注碼：二五雞');
    expect(text).toContain('爆棚：10');
    expect(text).toContain('統計');
    expect(text).toContain('手數：1');
    expect(text).toContain('流局：0');
    expect(text).toContain('32：食糊 1 ｜ 自摸 0 ｜ 出銃 0');
    expect(text).toContain('12232：食糊 0 ｜ 自摸 0 ｜ 出銃 1');
    expect(text).toContain('最多出銃：12232 (1)');
    expect(text).toContain('全部牌局');
    expect(text).toContain('全部');
    expect(text).toContain('食糊');
    expect(text).toContain('流局');
    expect(text).toContain('分享');
    expect(text).toContain('雲端房間已刪除，本機封存會繼續保留。');
  });
});
