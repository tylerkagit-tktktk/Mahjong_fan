import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Share, Text } from 'react-native';
import AppButton from '../../src/components/AppButton';
import GameDashboardScreen from '../../src/screens/GameDashboardScreen';
import { getGameBundle } from '../../src/db/repo';
import { aggregatePlayerTotalsQByTimeline } from '../../src/models/seatRotation';
import { computeGameStats } from '../../src/models/gameStats';
import { computeHkSettlement } from '../../src/domain/hk/settlement';
import { replayLocalGameBundle } from '../../src/services/localGameReplay';
import { traditionalRules } from '../../test-support/gameRecord/fixtures';

jest.mock('../../src/db/repo', () => ({
  getGameBundle: jest.fn(),
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

const mockedGetGameBundle = getGameBundle as jest.MockedFunction<typeof getGameBundle>;

function createEndedBundle() {
  return {
    game: {
      id: 'g-ended',
      title: 'Ended Match',
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
          applyDealerMultiplier: true,
        },
        settlement: { mode: 'immediate' },
      }),
      startingDealerSeatIndex: 0,
      progressIndex: 0,
      currentWindIndex: 0,
      currentRoundNumber: 1,
      maxWindIndex: 1,
      gameState: 'ended',
      currentRoundLabelZh: '東風南局',
      endedAt: 1735693200000,
      handsCount: 2,
      resultStatus: 'result',
      resultSummaryJson: JSON.stringify({
        winnerText: 'Bob +HK$20',
        loserText: 'Alice -HK$20',
        seatTotalsQ: [-80, 80, 0, 0],
        playersCount: 4,
      }),
      resultUpdatedAt: 1735693200000,
      languageOverride: null,
    },
    players: [
      { id: 'p0', gameId: 'g-ended', name: 'Alice', seatIndex: 0 },
      { id: 'p1', gameId: 'g-ended', name: 'Bob', seatIndex: 1 },
      { id: 'p2', gameId: 'g-ended', name: 'Carol', seatIndex: 2 },
      { id: 'p3', gameId: 'g-ended', name: 'David', seatIndex: 3 },
    ],
    hands: [
      {
        id: 'h1',
        gameId: 'g-ended',
        handIndex: 0,
        dealerSeatIndex: 0,
        windIndex: 0,
        roundNumber: 1,
        isDraw: false,
        winnerSeatIndex: 1,
        type: 'discard',
        winnerPlayerId: 'p1',
        discarderPlayerId: 'p0',
        inputValue: 0,
        deltasJson: JSON.stringify([-80, 80, 0, 0]),
        nextRoundLabelZh: '東風南局',
        computedJson: JSON.stringify({ settlementType: 'discard', fan: 4, effectiveFan: 4 }),
        createdAt: 1735690000000,
      },
      {
        id: 'h2',
        gameId: 'g-ended',
        handIndex: 1,
        dealerSeatIndex: 1,
        windIndex: 0,
        roundNumber: 2,
        isDraw: true,
        winnerSeatIndex: null,
        type: 'draw',
        winnerPlayerId: null,
        discarderPlayerId: null,
        inputValue: 0,
        deltasJson: null,
        nextRoundLabelZh: '東風南局',
        computedJson: JSON.stringify({ dealerAction: 'stick' }),
        createdAt: 1735691000000,
      },
    ],
  };
}

function createUnknownRulesBundle() {
  const ended = createEndedBundle();
  return {
    ...ended,
    game: {
      ...ended.game,
      rulesJson: JSON.stringify({
        ...JSON.parse(ended.game.rulesJson),
        hk: {
          ...JSON.parse(ended.game.rulesJson).hk,
          scoringPreset: 'mysteryPreset',
          gunMode: 'mysteryGun',
          stakePreset: 'mysteryStake',
        },
      }),
    },
  };
}

function createAuthoritativeCanonicalBundle() {
  const base = createEndedBundle();
  const rules = traditionalRules({ gunMode: 'halfGun' });
  const deltasQ = computeHkSettlement({
    rules,
    fan: 4,
    settlementType: 'discard',
    winnerSeatIndex: 1,
    discarderSeatIndex: 0,
  }).deltasQ;
  return {
    ...base,
    game: {
      ...base.game,
      id: 'g-canonical-dashboard',
      title: 'Canonical Dashboard Match',
      rulesJson: JSON.stringify(rules),
      seatBoundaryHistoryMode: 'explicit',
      initialSeatMappingJson: JSON.stringify({ 0: 'p0', 1: 'p1', 2: 'p2', 3: 'p3' }),
      resultSummaryJson: JSON.stringify({
        seatTotalsQ: deltasQ,
        playerTotalsQ: { p0: deltasQ[0], p1: deltasQ[1], p2: deltasQ[2], p3: deltasQ[3] },
        playersCount: 4,
      }),
    },
    hands: [
      {
        ...base.hands[0],
        gameId: 'g-canonical-dashboard',
        deltasJson: JSON.stringify({ unit: 'Q', values: deltasQ }),
        computedJson: JSON.stringify({ settlementType: 'discard', fan: 4 }),
      },
      {
        ...base.hands[1],
        gameId: 'g-canonical-dashboard',
        deltasJson: JSON.stringify({ unit: 'Q', values: [0, 0, 0, 0] }),
        computedJson: JSON.stringify({ settlementType: 'draw', dealerAction: 'stick' }),
      },
    ],
    players: base.players.map((player) => ({ ...player, gameId: 'g-canonical-dashboard' })),
    seatBoundaries: [],
  };
}

function createActiveBundle() {
  const ended = createEndedBundle();
  return {
    ...ended,
    game: {
      ...ended.game,
      id: 'g-active',
      gameState: 'active',
      endedAt: null,
      resultSummaryJson: null,
      resultStatus: null,
      handsCount: 1,
    },
  };
}

function createTieBundle() {
  const ended = createEndedBundle();
  return {
    ...ended,
    game: {
      ...ended.game,
      resultSummaryJson: JSON.stringify({
        winnerText: 'Alice +HK$20',
        loserText: 'Carol -HK$20',
        seatTotalsQ: [80, 80, -80, -80],
        playersCount: 4,
      }),
    },
    hands: [
      {
        ...ended.hands[0],
        deltasJson: JSON.stringify([80, 80, -80, -80]),
      },
    ],
  };
}

function createReseatMidGameBundle() {
  const ended = createEndedBundle();
  return {
    ...ended,
    game: {
      ...ended.game,
      title: 'Reseat Timeline Match',
      handsCount: 4,
      currentRoundLabelZh: '東風南局',
    },
    hands: [
      {
        ...ended.hands[0],
        id: 'rt-h1',
        handIndex: 0,
        winnerPlayerId: 'p0',
        discarderPlayerId: 'p1',
        deltasJson: JSON.stringify([40, -16, -12, -12]),
        nextRoundLabelZh: '北風南局',
      },
      {
        ...ended.hands[0],
        id: 'rt-h2',
        handIndex: 1,
        winnerPlayerId: 'p1',
        discarderPlayerId: 'p2',
        deltasJson: JSON.stringify([0, 40, -20, -20]),
        nextRoundLabelZh: '北風北局',
      },
      {
        ...ended.hands[0],
        id: 'rt-h3',
        handIndex: 2,
        winnerPlayerId: 'p0',
        discarderPlayerId: 'p3',
        deltasJson: JSON.stringify([20, -20, 0, 0]),
        nextRoundLabelZh: '東風東局',
      },
      {
        ...ended.hands[0],
        id: 'rt-h4',
        handIndex: 3,
        winnerPlayerId: 'p1',
        discarderPlayerId: 'p2',
        deltasJson: JSON.stringify([0, 0, 24, -24]),
        nextRoundLabelZh: '東風南局',
      },
    ],
  };
}

function createZimoBundle() {
  const ended = createEndedBundle();
  return {
    ...ended,
    game: {
      ...ended.game,
      id: 'g-zimo',
      title: 'Zimo Match',
      handsCount: 1,
    },
    hands: [
      {
        ...ended.hands[0],
        id: 'z1',
        handIndex: 0,
        type: 'zimo',
        winnerPlayerId: 'p1',
        discarderPlayerId: null,
        inputValue: 36,
        computedJson: JSON.stringify({ settlementType: 'zimo', fan: 12, effectiveFan: 10 }),
        deltasJson: JSON.stringify([-12, 36, -12, -12]),
      },
    ],
  };
}

function createFanSummaryFromComputedBundle() {
  const ended = createEndedBundle();
  return {
    ...ended,
    game: {
      ...ended.game,
      id: 'g-fan-computed',
      title: 'Fan Computed Match',
      handsCount: 1,
    },
    hands: [
      {
        ...ended.hands[0],
        id: 'fc1',
        handIndex: 0,
        type: 'discard',
        winnerPlayerId: 'p1',
        discarderPlayerId: 'p0',
        inputValue: 32,
        computedJson: JSON.stringify({ settlementType: 'discard', fan: 12, effectiveFan: 10 }),
      },
    ],
  };
}

function createCustomTableBundle() {
  const ended = createEndedBundle();
  return {
    ...ended,
    game: {
      ...ended.game,
      id: 'g-custom',
      title: 'Custom Table Match',
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
          scoringPreset: 'customTable',
          gunMode: 'halfGun',
          stakePreset: 'TWO_FIVE_CHICKEN',
          unitPerFan: 0.5,
          capFan: 10,
          applyDealerMultiplier: true,
        },
        settlement: { mode: 'immediate' },
      }),
    },
  };
}

describe('GameDashboardScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders ended game and ranks players by final totals', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createEndedBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k1', name: 'GameDashboard', params: { gameId: 'g-ended' } } as any} />,
      );
      await Promise.resolve();
    });

    const textContent = (tree! as renderer.ReactTestRenderer).root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(textContent).toContain('Ended Match');
    expect(textContent).toContain('已打 2 鋪');
    expect(textContent).toContain('🥇');
    expect(textContent).toContain('Bob');
    expect(textContent).toContain('+HK$20');
    expect(textContent).toContain('找數');
    expect(textContent).toContain('Alice → Bob');
    expect(textContent).toContain('戰果重點');
    expect(textContent).toContain('Alice ×1');
    expect(textContent).toContain('規則摘要');
    expect(textContent).not.toContain('傳統番數');
    expect(textContent).toContain('—');
    expect(textContent).toContain('出銃');
    expect(textContent).not.toContain('traditionalFan');
    expect(textContent).not.toContain('halfGun');

    const rankingStart = textContent.indexOf('玩家排名');
    const rankingEnd = textContent.indexOf('找數');
    const rankingSlice = textContent.slice(rankingStart, rankingEnd);
    expect(rankingSlice).not.toContain('\n東\n');
    expect(rankingSlice).not.toContain('\n南\n');
    expect(rankingSlice).not.toContain('\n西\n');
    expect(rankingSlice).not.toContain('\n北\n');

    await act(async () => {
      (tree! as renderer.ReactTestRenderer).root.findByProps({ testID: 'dashboard-rules-toggle' }).props.onPress();
    });
    const expandedText = (tree! as renderer.ReactTestRenderer).root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(expandedText).toContain('傳統番數');
    expect(expandedText).toContain('半銃');

    await act(async () => {
      (tree! as renderer.ReactTestRenderer).unmount();
    });
  });

  it('renders an authoritative explicit game through the canonical read projection without another bundle load', async () => {
    const bundle = createAuthoritativeCanonicalBundle();
    expect(replayLocalGameBundle(bundle as any).authoritative).toBe(true);
    mockedGetGameBundle.mockResolvedValueOnce(bundle as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'canonical', name: 'GameDashboard', params: { gameId: bundle.game.id } } as any} />,
      );
      await Promise.resolve();
    });

    const root = tree!.root;
    const text = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(text).toContain('Canonical Dashboard Match');
    expect(text).toContain('Bob');
    expect(text).toContain('流局');
    expect(mockedGetGameBundle).toHaveBeenCalledTimes(1);

    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' as never });
    const shareButton = root.findAllByType(AppButton).find((button) => button.props.label === '分享');
    await act(async () => {
      await shareButton?.props.onPress();
    });
    const payload = shareSpy.mock.calls[0][0] as { message: string };
    expect(payload.message).toContain('Alice → Bob HK$8');
    shareSpy.mockRestore();

    await act(async () => {
      root.findByProps({ testID: 'wind-section-東風' }).props.onPress();
    });
    expect(root.findByProps({ testID: 'hand-row-h1' })).toBeTruthy();
    expect(root.findByProps({ testID: 'hand-row-h2' })).toBeTruthy();

    await act(async () => {
      tree!.unmount();
    });
  });

  it('renders an authoritative ended game as a read-only dashboard without a reopen action', async () => {
    const bundle = createAuthoritativeCanonicalBundle();
    mockedGetGameBundle.mockResolvedValueOnce(bundle as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'terminal', name: 'GameDashboard', params: { gameId: bundle.game.id } } as any} />,
      );
      await Promise.resolve();
    });

    expect(() => tree!.root.findByProps({ testID: 'dashboard-reopen' })).toThrow();
    expect(tree!.root.findAllByType(AppButton).map((button) => button.props.label)).not.toContain('重新開啟牌局');

    await act(async () => {
      tree!.unmount();
    });
  });

  it('shows the repository read error without substituting a legacy dashboard', async () => {
    mockedGetGameBundle.mockRejectedValueOnce(new Error('database unavailable'));

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'read-error', name: 'GameDashboard', params: { gameId: 'missing' } } as any} />,
      );
      await Promise.resolve();
    });

    const text = tree!.root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(text).toContain('database unavailable');
    expect(text).not.toContain('玩家排名');
    expect(mockedGetGameBundle).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.unmount();
    });
  });

  it('shows win/draw rows and expands hand details', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createEndedBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k2', name: 'GameDashboard', params: { gameId: 'g-ended' } } as any} />,
      );
      await Promise.resolve();
    });

    const root = (tree! as renderer.ReactTestRenderer).root;
    const allText = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(allText).toContain('流局');
    expect(allText).not.toContain('載入更多');
    expect(root.findByProps({ testID: 'hands-filter-all' })).toBeTruthy();
    expect(root.findByProps({ testID: 'hands-filter-wins' })).toBeTruthy();
    expect(root.findByProps({ testID: 'hands-filter-draws' })).toBeTruthy();
    expect(root.findByProps({ testID: 'jump-東風' })).toBeTruthy();
    expect(root.findByProps({ testID: 'jump-南風' })).toBeTruthy();
    expect(allText).toContain('＋');

    expect(() => root.findByProps({ testID: 'hand-row-h1' })).toThrow();

    const windSection = root.findByProps({ testID: 'wind-section-東風' });
    await act(async () => {
      windSection.props.onPress();
    });
    expect(root.findAllByType(Text).map((node) => String(node.props.children)).join('\n')).toContain('Alice 出銃比 Bob 4 番');

    const firstHandPressable = root.findByProps({ testID: 'hand-row-h1' });
    await act(async () => {
      firstHandPressable.props.onPress();
    });
    expect(root.findByProps({ testID: 'hand-row-h2' })).toBeTruthy();

    const expandedText = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(expandedText).toContain('贏家');
    expect(expandedText).toContain('點炮者');
    expect(expandedText).not.toContain('計算資料');
    expect(expandedText).not.toContain('{"dealerAction":"stick"}');
    expect(expandedText).not.toContain('[-80,80,0,0]');

    await act(async () => {
      windSection.props.onPress();
    });
    expect(() => root.findByProps({ testID: 'hand-row-h1' })).toThrow();

    const winsFilter = root.findByProps({ testID: 'hands-filter-wins' });
    await act(async () => {
      winsFilter.props.onPress();
    });
    expect(() => root.findByProps({ testID: 'hand-row-h1' })).toThrow();
    await act(async () => {
      windSection.props.onPress();
    });
    expect(root.findByProps({ testID: 'hand-row-h1' })).toBeTruthy();
    expect(() => root.findByProps({ testID: 'hand-row-h2' })).toThrow();
    expect(root.findAllByType(Text).map((node) => String(node.props.children)).join('\n')).toContain('流局');

    await act(async () => {
      (tree! as renderer.ReactTestRenderer).unmount();
    });
  });

  it('renders zimo hand summary with winner and effective fan', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createZimoBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k8', name: 'GameDashboard', params: { gameId: 'g-zimo' } } as any} />,
      );
      await Promise.resolve();
    });

    const root = tree!.root;
    const windSection = root.findByProps({ testID: 'wind-section-東風' });
    await act(async () => {
      windSection.props.onPress();
    });

    const allText = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(allText).toContain('Bob 自摸 10 番');
    expect(allText).not.toContain('Bob 自摸 36 番');

    await act(async () => {
      tree!.unmount();
    });
  });

  it('renders discard summary fan from computedJson instead of amount', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createFanSummaryFromComputedBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k9', name: 'GameDashboard', params: { gameId: 'g-fan-computed' } } as any} />,
      );
      await Promise.resolve();
    });

    const root = tree!.root;
    const windSection = root.findByProps({ testID: 'wind-section-東風' });
    await act(async () => {
      windSection.props.onPress();
    });

    const allText = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(allText).toContain('Alice 出銃比 Bob 10 番');
    expect(allText).not.toContain('Alice 出銃比 Bob 32 番');

    await act(async () => {
      tree!.unmount();
    });
  });

  it('never renders unknown rules enum raw strings', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createUnknownRulesBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k4', name: 'GameDashboard', params: { gameId: 'g-ended' } } as any} />,
      );
      await Promise.resolve();
    });

    const textContent = (tree! as renderer.ReactTestRenderer).root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(textContent).not.toContain('mysteryPreset');
    expect(textContent).not.toContain('mysteryGun');
    expect(textContent).not.toContain('mysteryStake');

    await act(async () => {
      (tree! as renderer.ReactTestRenderer).unmount();
    });
  });

  it('renders customTable rules summary without gun/stake lines', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createCustomTableBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k10', name: 'GameDashboard', params: { gameId: 'g-custom' } } as any} />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      (tree! as renderer.ReactTestRenderer).root.findByProps({ testID: 'dashboard-rules-toggle' }).props.onPress();
    });
    const textContent = (tree! as renderer.ReactTestRenderer).root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(textContent).toContain('自訂番數（價錢表）');
    expect(textContent).toContain('每番金額：HK$0.5');
    expect(textContent).toContain('自摸：3 份；出銃：2 份');
    expect(textContent).not.toContain('銃制：');
    expect(textContent).not.toContain('注碼：');

    await act(async () => {
      (tree! as renderer.ReactTestRenderer).unmount();
    });
  });

  it('blocks non-ended game and triggers warning flow', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createActiveBundle() as any);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' as never });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k3', name: 'GameDashboard', params: { gameId: 'g-active' } } as any} />,
      );
      await Promise.resolve();
    });

    const buttons = (tree! as renderer.ReactTestRenderer).root.findAllByType(AppButton);
    const shareButton = buttons.find((button) => button.props.label === '分享');
    const allText = (tree! as renderer.ReactTestRenderer).root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');

    expect(shareButton?.props.disabled).toBe(true);
    expect(allText).toContain('此頁僅供已結束對局查看。');
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockClear();

    await act(async () => {
      await shareButton?.props.onPress();
    });
    expect(shareSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();

    alertSpy.mockRestore();
    shareSpy.mockRestore();

    await act(async () => {
      (tree! as renderer.ReactTestRenderer).unmount();
    });
  });

  it('shares human-readable summary without raw i18n keys', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createEndedBundle() as any);
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' as never });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k5', name: 'GameDashboard', params: { gameId: 'g-ended' } } as any} />,
      );
      await Promise.resolve();
    });

    const root = (tree! as renderer.ReactTestRenderer).root;
    const shareButton = root.findAllByType(AppButton).find((btn) => btn.props.label === '分享');
    expect(shareButton).toBeTruthy();

    await act(async () => {
      await shareButton!.props.onPress();
    });

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const payload = shareSpy.mock.calls[0][0] as { message: string };
    expect(payload.message).toContain('Ended Match');
    expect(payload.message).toContain('Ended Match — 01/01/2025');
    expect(payload.message).toContain('牌局戰果');
    expect(payload.message).toContain('找數');
    expect(payload.message).toContain('Alice → Bob HK$20');
    expect(payload.message).toContain('最多出銃');
    expect(payload.message).not.toContain('食糊 1 ｜');
    expect(payload.message).not.toMatch(/game\.detail\./);
    expect(payload.message).not.toMatch(/share\./);
    expect(payload.message).not.toContain('undefined');

    shareSpy.mockRestore();
    await act(async () => {
      (tree! as renderer.ReactTestRenderer).unmount();
    });
  });

  it('does not append tie suffix in share ranking when totals tie', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createTieBundle() as any);
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' as never });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k6', name: 'GameDashboard', params: { gameId: 'g-ended' } } as any} />,
      );
      await Promise.resolve();
    });

    const shareButton = (tree! as renderer.ReactTestRenderer).root
      .findAllByType(AppButton)
      .find((btn) => btn.props.label === '分享');
    await act(async () => {
      await shareButton?.props.onPress();
    });

    const payload = shareSpy.mock.calls[0][0] as { message: string };
    expect(payload.message).toContain('1. Alice +HK$20');
    expect(payload.message).toContain('1. Bob +HK$20');
    expect(payload.message).toContain('3. Carol -HK$20');
    expect(payload.message).toContain('3. David -HK$20');
    expect(payload.message).not.toContain('(+1 more)');
    expect(payload.message).not.toContain('（另 +');

    shareSpy.mockRestore();
    await act(async () => {
      (tree! as renderer.ReactTestRenderer).unmount();
    });
  });

  it('keeps share totals consistent with reseat-aware timeline aggregation', async () => {
    const bundle = createReseatMidGameBundle();
    mockedGetGameBundle.mockResolvedValueOnce(bundle as any);
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' as never });

    const preTotalsQ = aggregatePlayerTotalsQByTimeline(
      bundle.players,
      bundle.hands.slice(0, 3).map((hand) => ({
        nextRoundLabelZh: hand.nextRoundLabelZh,
        deltasQ: JSON.parse(hand.deltasJson ?? '[0,0,0,0]'),
      })),
      '東風東局',
      0,
    );
    const allTotalsQ = aggregatePlayerTotalsQByTimeline(
      bundle.players,
      bundle.hands.map((hand) => ({
        nextRoundLabelZh: hand.nextRoundLabelZh,
        deltasQ: JSON.parse(hand.deltasJson ?? '[0,0,0,0]'),
      })),
      '東風東局',
      0,
    );
    expect(preTotalsQ.get('p0')).toBe(60);
    expect(preTotalsQ.get('p1')).toBe(4);
    expect(allTotalsQ.get('p0')).toBe(60);
    expect(allTotalsQ.get('p1')).toBe(28);
    const sumAll = Array.from(allTotalsQ.values()).reduce((sum, value) => sum + value, 0);
    expect(sumAll).toBe(0);
    const stats = computeGameStats(bundle as any);
    expect(stats.zeroSumOk).toBe(true);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k7', name: 'GameDashboard', params: { gameId: 'g-ended' } } as any} />,
      );
      await Promise.resolve();
    });

    const shareButton = (tree! as renderer.ReactTestRenderer).root
      .findAllByType(AppButton)
      .find((btn) => btn.props.label === '分享');
    await act(async () => {
      await shareButton?.props.onPress();
    });

    const payload = shareSpy.mock.calls[0][0] as { message: string };
    expect(payload.message).toContain('Alice +HK$15');
    expect(payload.message).toContain('Bob +HK$7');
    expect(payload.message).toContain('David -HK$8');
    expect(payload.message).toContain('Carol -HK$14');
    expect(payload.message).not.toMatch(/game\.detail\./);
    expect(payload.message).not.toContain('undefined');

    shareSpy.mockRestore();
    await act(async () => {
      (tree! as renderer.ReactTestRenderer).unmount();
    });
  });

  it('keeps zero-balance results readable with no settlement and accessible collapsed sections', async () => {
    const bundle = createEndedBundle();
    bundle.hands = bundle.hands.map((hand) => ({
      ...hand,
      deltasJson: JSON.stringify([0, 0, 0, 0]),
    })) as typeof bundle.hands;
    bundle.game.resultSummaryJson = JSON.stringify({ seatTotalsQ: [0, 0, 0, 0], playersCount: 4 });
    bundle.players = bundle.players.map((player, index) => ({
      ...player,
      name: index === 0 ? 'A very long English player name that should not hide the balance' : player.name,
    }));
    mockedGetGameBundle.mockResolvedValueOnce(bundle as any);
    let resolveShare: ((value: { action: never }) => void) | null = null;
    const shareSpy = jest.spyOn(Share, 'share').mockImplementation(
      () => new Promise((resolve) => { resolveShare = resolve as (value: { action: never }) => void; }),
    );

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'zero', name: 'GameDashboard', params: { gameId: bundle.game.id } } as any} />,
      );
      await Promise.resolve();
    });

    const root = tree!.root;
    const text = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(text).toContain('無需找數');
    expect((text.match(/🥇/g) ?? [])).toHaveLength(4);
    expect(text).toContain('A very long English player name that should not hide the balance');
    expect(text).toContain('0');
    expect(root.findByProps({ testID: 'wind-section-東風' }).props.accessibilityState).toEqual({ expanded: false });
    expect(root.findByProps({ testID: 'dashboard-rules-toggle' }).props.accessibilityState).toEqual({ expanded: false });

    const shareButton = root.findByProps({ testID: 'dashboard-share' });
    await act(async () => {
      shareButton.props.onPress();
      shareButton.props.onPress();
    });
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect((shareSpy.mock.calls[0][0] as { message: string }).message).toContain('無需找數');
    await act(async () => {
      resolveShare?.({ action: 'dismissedAction' as never });
      await Promise.resolve();
    });

    shareSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });

  it('shows a user-facing message when native sharing rejects', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createEndedBundle() as any);
    const shareSpy = jest.spyOn(Share, 'share').mockRejectedValue(new Error('share unavailable'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'share-error', name: 'GameDashboard', params: { gameId: 'g-ended' } } as any} />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await tree!.root.findByProps({ testID: 'dashboard-share' }).props.onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith('未能分享結果', '請稍後再試。');

    alertSpy.mockRestore();
    shareSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });
});
