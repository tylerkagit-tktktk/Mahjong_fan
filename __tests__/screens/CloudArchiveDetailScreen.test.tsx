import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import CloudArchiveDetailScreen from '../../src/screens/cloud/CloudArchiveDetailScreen';
import { loadArchivedGame } from '../../src/services/cloud/archiveRepo';
import { ensureSession } from '../../src/services/cloud/authRepo';
import {
  deleteArchivedRoomAfterSync,
  getArchiveSyncStatus,
  subscribeMembers,
} from '../../src/services/cloud/roomRepo';
import type { CloudArchivePayload } from '../../src/models/cloud';
import { customRules, traditionalRules } from '../../test-support/gameRecord/fixtures';
import {
  CLOUD_PLAYER_IDS,
  cloudHand,
  cloudLineup,
  cloudMember,
  createCloudArchiveFixture,
} from '../../test-support/gameRecord/cloudFixtures';

jest.mock('../../src/services/cloud/archiveRepo', () => ({ loadArchivedGame: jest.fn() }));
jest.mock('../../src/services/cloud/authRepo', () => ({ ensureSession: jest.fn() }));
jest.mock('../../src/services/cloud/roomRepo', () => ({
  deleteArchivedRoomAfterSync: jest.fn(),
  getArchiveSyncStatus: jest.fn(),
  subscribeMembers: jest.fn(),
}));
jest.mock('../../src/i18n/useAppLanguage', () => {
  const translate = (key: string) => key;
  return { useAppLanguage: () => ({ t: translate, language: 'zh-Hant' }) };
});
jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  const { View: NativeView } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactLib.createElement(NativeView, null, children),
  };
});

const mockedLoadArchivedGame = loadArchivedGame as jest.MockedFunction<typeof loadArchivedGame>;
const mockedEnsureSession = ensureSession as jest.MockedFunction<typeof ensureSession>;
const mockedSubscribeMembers = subscribeMembers as jest.MockedFunction<typeof subscribeMembers>;
const mockedGetArchiveSyncStatus = getArchiveSyncStatus as jest.MockedFunction<typeof getArchiveSyncStatus>;
const mockedDeleteArchivedRoomAfterSync = deleteArchivedRoomAfterSync as jest.MockedFunction<typeof deleteArchivedRoomAfterSync>;
const renderedTrees: renderer.ReactTestRenderer[] = [];

function membersWithFifth() {
  return [
    cloudMember(CLOUD_PLAYER_IDS.east, 'East'),
    cloudMember(CLOUD_PLAYER_IDS.south, 'South'),
    cloudMember(CLOUD_PLAYER_IDS.west, 'West'),
    cloudMember(CLOUD_PLAYER_IDS.north, 'North'),
    cloudMember(CLOUD_PLAYER_IDS.fifth, 'Fifth'),
  ];
}

function createArchive(input: Parameters<typeof createCloudArchiveFixture>[0] = {}): CloudArchivePayload {
  const archive = createCloudArchiveFixture(input);
  archive.room.title = 'Canonical Cloud Match';
  return archive;
}

function createOneHandArchive(): CloudArchivePayload {
  return createArchive({
    rules: traditionalRules({ gunMode: 'fullGun' }),
    hands: [cloudHand({
      handIndex: 1,
      handId: 'production-hand-1',
      type: 'discard',
      winnerPlayerId: CLOUD_PLAYER_IDS.south,
      discarderPlayerId: CLOUD_PLAYER_IDS.east,
    })],
  });
}

function createMixedHistoryArchive(): CloudArchivePayload {
  return createArchive({
    rules: traditionalRules({ gunMode: 'fullGun' }),
    hands: [
      cloudHand({ handIndex: 1, handId: 'zimo-1', type: 'zimo', winnerPlayerId: CLOUD_PLAYER_IDS.east }),
      cloudHand({ handIndex: 2, handId: 'discard-2', type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.south, discarderPlayerId: CLOUD_PLAYER_IDS.east, fan: 4 }),
      cloudHand({ handIndex: 3, handId: 'draw-stay-3', type: 'draw', dealerAction: 'stick' }),
      cloudHand({ handIndex: 4, handId: 'draw-pass-4', type: 'draw', dealerAction: 'pass' }),
    ],
  });
}

type NavigationMock = {
  goBack: jest.Mock;
  setOptions: jest.Mock;
};

async function renderScreen(archive: CloudArchivePayload | null = createOneHandArchive()) {
  mockedLoadArchivedGame.mockResolvedValue(archive);
  const navigation: NavigationMock = { goBack: jest.fn(), setOptions: jest.fn() };
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <CloudArchiveDetailScreen
        navigation={navigation as never}
        route={{ key: 'cloud-result', name: 'CloudArchiveDetail', params: { roomId: CLOUD_PLAYER_IDS.east } } as never}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  renderedTrees.push(tree!);
  return { tree: tree!, navigation };
}

function textContent(root: renderer.ReactTestInstance): string {
  return root.findAllByType(Text).map((node) => {
    const flatten = (value: unknown): string => Array.isArray(value)
      ? value.map(flatten).join('')
      : value === null || value === undefined
        ? ''
        : String(value);
    return flatten(node.props.children);
  }).join('\n');
}

function latestNavigationOptions(navigation: NavigationMock) {
  const call = navigation.setOptions.mock.calls[navigation.setOptions.mock.calls.length - 1];
  if (!call) throw new Error('Expected navigation options');
  return call[0] as {
    headerRight: () => React.ReactElement;
    unstable_headerRightItems: () => Array<{ onPress: () => void; disabled: boolean; accessibilityLabel: string }>;
  };
}

describe('CloudArchiveDetailScreen canonical integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnsureSession.mockResolvedValue({ uid: CLOUD_PLAYER_IDS.east, provider: 'anonymous' });
    mockedSubscribeMembers.mockReturnValue(jest.fn());
    mockedGetArchiveSyncStatus.mockReturnValue({
      requiredMemberCount: 4,
      syncedMemberCount: 4,
      pendingMemberNames: [],
      isReadyForCloudDeletion: true,
    });
    mockedDeleteArchivedRoomAfterSync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => renderedTrees.splice(0).forEach((tree) => tree.unmount()));
  });

  it('renders canonical hero, competition ranking, compact stats, and secondary Cloud cleanup', async () => {
    const { tree } = await renderScreen();
    const text = textContent(tree.root);

    expect(text).toContain('對局總結');
    expect(text).toContain('Canonical Cloud Match');
    expect(text).toContain('東風南局 · 已打 1 鋪');
    expect(text).toContain('玩家排名');
    expect(text).toContain('+HK$8');
    expect(text).toContain('-HK$8');
    expect(text).toContain('牌局統計');
    expect(text).toContain('局數');
    expect(text).toContain('流局');
    expect(text).toContain('最多出銃');
    expect(text).toContain('East ×1');
    expect(text).toContain('牌局紀錄 · 1 鋪');
    expect(text).toContain('規則摘要');
    expect(text).toContain('雲端清理');
    expect(text.indexOf('雲端清理')).toBeGreaterThan(text.indexOf('規則摘要'));
  });

  it('uses production one-based source semantics and keeps history globally collapsed by default', async () => {
    const { tree } = await renderScreen();

    expect(tree.root.findAllByProps({ testID: 'cloud-hand-row-production-hand-1' })).toHaveLength(0);
    const toggle = tree.root.findByProps({ testID: 'cloud-history-toggle' });
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false, disabled: false });

    await act(async () => toggle.props.onPress());

    expect(tree.root.findByProps({ testID: 'cloud-hand-number-production-hand-1' }).props.children).toBe('第 1 鋪');
    expect(textContent(tree.root)).not.toContain('第 2 鋪');
    expect(tree.root.findByProps({ testID: 'cloud-history-toggle' }).props.accessibilityState.expanded).toBe(true);

    await act(async () => tree.root.findByProps({ testID: 'cloud-history-toggle' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'cloud-hand-row-production-hand-1' })).toHaveLength(0);
  });

  it('renders event-first zimo, discard, draw-stay, and draw-pass rows with winner-only amounts', async () => {
    const { tree } = await renderScreen(createMixedHistoryArchive());
    await act(async () => tree.root.findByProps({ testID: 'cloud-history-toggle' }).props.onPress());
    const text = textContent(tree.root);

    expect(text).toContain('East 自摸 · 3 番');
    expect(text).toContain('South 食糊 · East 出銃 · 4 番');
    expect(text).toContain('流局 · 留莊');
    expect(text).toContain('流局 · 過莊');
    expect(tree.root.findAll((node) => node.type === Text && node.props.testID === 'cloud-hand-gain-zimo-1')).toHaveLength(1);
    expect(tree.root.findAll((node) => node.type === Text && node.props.testID === 'cloud-hand-gain-discard-2')).toHaveLength(1);
    expect(tree.root.findAll((node) => node.type === Text && node.props.testID === 'cloud-hand-gain-draw-stay-3')).toHaveLength(0);
    expect(tree.root.findAll((node) => node.type === Text && node.props.testID === 'cloud-hand-gain-draw-pass-4')).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'cloud-hand-row-discard-2' }).props.accessibilityLabel).toContain('South 食糊');
  });

  it('groups canonical current-hand rounds by wind without per-wind disclosure', async () => {
    const archive = createArchive({ hands: [
      cloudHand({ handIndex: 1, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.south, discarderPlayerId: CLOUD_PLAYER_IDS.east }),
      cloudHand({ handIndex: 2, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.west, discarderPlayerId: CLOUD_PLAYER_IDS.south }),
      cloudHand({ handIndex: 3, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.north, discarderPlayerId: CLOUD_PLAYER_IDS.west }),
      cloudHand({ handIndex: 4, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.east, discarderPlayerId: CLOUD_PLAYER_IDS.north }),
      cloudHand({ handIndex: 5, type: 'draw', dealerAction: 'stick' }),
    ] });
    const { tree } = await renderScreen(archive);
    await act(async () => tree.root.findByProps({ testID: 'cloud-history-toggle' }).props.onPress());

    expect(tree.root.findAll((node) => node.type === View && node.props.testID === 'cloud-wind-section-東風')).toHaveLength(1);
    expect(tree.root.findAll((node) => node.type === View && node.props.testID === 'cloud-wind-section-南風')).toHaveLength(1);
    expect(tree.root.findAll((node) => String(node.props.testID ?? '').startsWith('cloud-wind-toggle-'))).toHaveLength(0);
  });

  it('removes filters, per-wind collapse, bottom Share, and four-seat delta chips', async () => {
    const { tree } = await renderScreen(createMixedHistoryArchive());
    await act(async () => tree.root.findByProps({ testID: 'cloud-history-toggle' }).props.onPress());
    const text = textContent(tree.root);

    expect(text).not.toContain('全部');
    expect(tree.root.findAll((node) => String(node.props.testID ?? '').startsWith('cloud-history-filter-'))).toHaveLength(0);
    expect(tree.root.findAll((node) => String(node.props.testID ?? '').startsWith('cloud-delta-'))).toHaveLength(0);
    expect(tree.root.findAllByType(Pressable).filter((node) => node.props.accessibilityLabel === '分享戰果')).toHaveLength(0);
  });

  it('uses exact competition ranks for ties and all-zero results', async () => {
    const tiedArchive = createArchive({
      rules: traditionalRules({ gunMode: 'fullGun' }),
      hands: [
        cloudHand({ handIndex: 1, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.east, discarderPlayerId: CLOUD_PLAYER_IDS.west }),
        cloudHand({ handIndex: 2, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.south, discarderPlayerId: CLOUD_PLAYER_IDS.north }),
        cloudHand({ handIndex: 3, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.west, discarderPlayerId: CLOUD_PLAYER_IDS.north }),
      ],
    });
    const tied = await renderScreen(tiedArchive);
    const tiedLabels = [...new Set(tied.tree.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('最終'))
      .map((node) => node.props.accessibilityLabel as string))];
    expect(tiedLabels.filter((label) => label.includes('第 1 名'))).toHaveLength(2);
    expect(tiedLabels.some((label) => label.includes('第 3 名'))).toBe(true);
    expect(tiedLabels.some((label) => label.includes('第 4 名'))).toBe(true);
    expect(tiedLabels.map((label) => label.split('，')[1])).toEqual(['East', 'South', 'West', 'North']);

    const zero = await renderScreen(createArchive());
    const zeroLabels = [...new Set(zero.tree.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('最終'))
      .map((node) => node.props.accessibilityLabel as string))];
    expect(zeroLabels).toHaveLength(4);
    expect(zeroLabels.every((label) => label.includes('第 1 名'))).toBe(true);
  });

  it('renders every actual historical participant beyond four and excludes a pending never-played identity', async () => {
    const replacementSeats = {
      '0': CLOUD_PLAYER_IDS.east, '1': CLOUD_PLAYER_IDS.south,
      '2': CLOUD_PLAYER_IDS.west, '3': CLOUD_PLAYER_IDS.fifth,
    };
    const participated = await renderScreen(createArchive({
      members: membersWithFifth(),
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2, seats: replacementSeats }),
      ],
      hands: [
        cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 1 }),
        cloudHand({ handIndex: 2, type: 'draw', lineupVersion: 2 }),
      ],
    }));
    expect(textContent(participated.tree.root)).toContain('Fifth');
    const rankLabels = [...new Set(participated.tree.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('最終'))
      .map((node) => node.props.accessibilityLabel as string))];
    expect(rankLabels).toHaveLength(5);

    const pending = await renderScreen(createArchive({
      members: membersWithFifth(),
      lineups: [
        cloudLineup({ lineupVersion: 1, effectiveFromHandIndex: 0 }),
        cloudLineup({ lineupVersion: 2, effectiveFromHandIndex: 2, seats: replacementSeats }),
      ],
      hands: [cloudHand({ handIndex: 1, type: 'draw', lineupVersion: 1 })],
    }));
    const pendingRankLabels = [...new Set(pending.tree.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('最終'))
      .map((node) => node.props.accessibilityLabel as string))];
    expect(pendingRankLabels).toHaveLength(4);
    expect(pendingRankLabels.some((label) => label.includes('Fifth'))).toBe(false);
  });

  it('shows all tied stat leaders and no fake leader for a zero category', async () => {
    const archive = createArchive({ hands: [
      cloudHand({ handIndex: 1, type: 'zimo', winnerPlayerId: CLOUD_PLAYER_IDS.east }),
      cloudHand({ handIndex: 2, type: 'zimo', winnerPlayerId: CLOUD_PLAYER_IDS.south }),
      cloudHand({ handIndex: 3, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.east, discarderPlayerId: CLOUD_PLAYER_IDS.west }),
      cloudHand({ handIndex: 4, type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.south, discarderPlayerId: CLOUD_PLAYER_IDS.north }),
    ] });
    const { tree } = await renderScreen(archive);
    const text = textContent(tree.root);
    expect(text).toContain('East, South ×1');
    expect(text).toContain('West, North ×1');

    const allDraw = await renderScreen(createArchive({ hands: [cloudHand({ handIndex: 1, type: 'draw' })] }));
    const allDrawText = textContent(allDraw.tree.root);
    expect(allDrawText.match(/—/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps Rules collapsed and expands only validated canonical rule values', async () => {
    const { tree } = await renderScreen();
    const collapsedText = textContent(tree.root);
    expect(collapsedText).not.toContain('傳統番數');
    const toggle = tree.root.findByProps({ testID: 'cloud-rules-toggle' });
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });

    await act(async () => toggle.props.onPress());
    const expandedText = textContent(tree.root);
    expect(expandedText).toContain('香港牌');
    expect(expandedText).toContain('傳統番數');
    expect(expandedText).toContain('全銃');
    expect(tree.root.findByProps({ testID: 'cloud-rules-toggle' }).props.accessibilityState).toEqual({ expanded: true });
  });

  it('keeps a zero-hand history disclosure disabled with the canonical total', async () => {
    const { tree } = await renderScreen(createArchive());
    const toggle = tree.root.findByProps({ testID: 'cloud-history-toggle' });
    expect(textContent(tree.root)).toContain('牌局紀錄 · 0 鋪');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false, disabled: true });
    expect(toggle.props.disabled).toBe(true);
  });

  it('keeps archive read failure separate from canonical-invalid result handling', async () => {
    const { tree, navigation } = await renderScreen(null);
    expect(textContent(tree.root)).toContain('找不到封存牌局。');
    expect(textContent(tree.root)).not.toContain('暫時無法確認牌局結果');
    const backButton = tree.root.findAll((node) => node.props.accessibilityLabel === '返回' && typeof node.props.onPress === 'function')[0];
    expect(backButton).toBeDefined();
    await act(async () => backButton?.props.onPress());
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a safe unavailable result for malformed source/rules and never falls back to ranking', async () => {
    const malformed = createOneHandArchive();
    malformed.hands[0].handIndex = 0;
    const invalidTimeline = await renderScreen(malformed);
    let text = textContent(invalidTimeline.tree.root);
    expect(text).toContain('暫時無法確認牌局結果');
    expect(text).toContain('部分牌局資料不完整');
    expect(text).not.toContain('玩家排名');
    expect(text).not.toContain('+HK$8');

    const badRules = createOneHandArchive();
    badRules.room.rulesSnapshot = {};
    const invalidRules = await renderScreen(badRules);
    text = textContent(invalidRules.tree.root);
    expect(text).toContain('暫時無法確認牌局結果');
    expect(text).not.toContain('傳統番數');
  });

  it('uses one accessible App Bar Share with canonical ranking/stats and an in-flight guard', async () => {
    let resolveShare: ((value: { action: string }) => void) | null = null;
    const sharePromise = new Promise<{ action: string }>((resolve) => { resolveShare = resolve; });
    const shareSpy = jest.spyOn(Share, 'share').mockReturnValue(sharePromise as never);
    const { navigation } = await renderScreen();
    const options = latestNavigationOptions(navigation);
    const item = options.unstable_headerRightItems()[0];
    expect(item.accessibilityLabel).toBe('分享戰果');
    expect(item.disabled).toBe(false);

    await act(async () => {
      item.onPress();
      item.onPress();
      await Promise.resolve();
    });
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy.mock.calls[0][0].message).toContain('1. South +HK$8');
    expect(shareSpy.mock.calls[0][0].message).toContain('已打 1 鋪 · 流局 0');
    expect(shareSpy.mock.calls[0][0].message).toContain('最多出銃：East ×1');

    await act(async () => {
      resolveShare?.({ action: 'sharedAction' });
      await sharePromise;
    });
    shareSpy.mockRestore();
  });

  it('treats native Share cancellation normally and alerts only on real rejection', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const shareSpy = jest.spyOn(Share, 'share');
    shareSpy.mockResolvedValueOnce({ action: 'dismissedAction' });
    let rendered = await renderScreen();
    await act(async () => {
      rendered.navigation.setOptions.mock.calls.at(-1)?.[0].unstable_headerRightItems()[0].onPress();
      await Promise.resolve();
    });
    expect(alertSpy).not.toHaveBeenCalled();

    shareSpy.mockRejectedValueOnce(new Error('share failed'));
    rendered = await renderScreen();
    await act(async () => {
      rendered.navigation.setOptions.mock.calls.at(-1)?.[0].unstable_headerRightItems()[0].onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(alertSpy).toHaveBeenCalledWith('未能分享結果', '請稍後再試。');
    shareSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('keeps long names flexible and large canonical winner amounts visible', async () => {
    const longName = 'A very long Firebase display name that must wrap safely';
    const archive = createArchive({
      rules: customRules({ minFanToWin: 0, unitPerFan: 1280, capFan: null, gunMode: 'fullGun' }),
      members: [
        cloudMember(CLOUD_PLAYER_IDS.east, longName),
        cloudMember(CLOUD_PLAYER_IDS.south, 'South'),
        cloudMember(CLOUD_PLAYER_IDS.west, 'West'),
        cloudMember(CLOUD_PLAYER_IDS.north, 'North'),
      ],
      hands: [cloudHand({ handIndex: 1, handId: 'large-amount', type: 'discard', winnerPlayerId: CLOUD_PLAYER_IDS.east, discarderPlayerId: CLOUD_PLAYER_IDS.south, fan: 1 })],
    });
    const { tree } = await renderScreen(archive);
    await act(async () => tree.root.findByProps({ testID: 'cloud-history-toggle' }).props.onPress());
    const eventRow = tree.root.findByProps({ testID: 'cloud-hand-event-row-large-amount' });
    const summaryStyle = StyleSheet.flatten(eventRow.findAllByType(Text)[0].props.style);
    const gain = tree.root.findByProps({ testID: 'cloud-hand-gain-large-amount' });
    const gainStyle = StyleSheet.flatten(gain.props.style);

    expect(textContent(tree.root)).toContain(longName);
    expect(String(gain.props.children)).toMatch(/^\+HK\$\d{4,}$/);
    expect(summaryStyle).toMatchObject({ flex: 1, minWidth: 0 });
    expect(gainStyle).toMatchObject({ flexShrink: 0, textAlign: 'right' });
  });
});
