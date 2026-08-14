import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, SectionList, Share, StyleSheet, Text } from 'react-native';
import AppButton from '../../src/components/AppButton';
import Card from '../../src/components/Card';
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

function createExplicitReseatCanonicalBundle() {
  const base = createEndedBundle();
  const gameId = 'g-explicit-reseat-dashboard';
  const rules = traditionalRules({ gunMode: 'halfGun' });
  const deltasQ = computeHkSettlement({
    rules,
    fan: 3,
    settlementType: 'discard',
    winnerSeatIndex: 0,
    discarderSeatIndex: 1,
  }).deltasQ;
  return {
    ...base,
    game: {
      ...base.game,
      id: gameId,
      title: 'Explicit Reseat Dashboard Match',
      rulesJson: JSON.stringify(rules),
      currentRoundLabelZh: '東風東局',
      handsCount: 2,
      seatBoundaryHistoryMode: 'explicit',
      initialSeatMappingJson: JSON.stringify({ 0: 'p0', 1: 'p1', 2: 'p2', 3: 'p3' }),
      resultSummaryJson: JSON.stringify({
        winnerText: 'North +HK$6',
        loserText: 'South -HK$6',
        seatTotalsQ: [64, -32, -16, -16],
        playerTotalsQ: { p0: 16, p1: -24, p2: -16, p3: 24 },
        playersCount: 4,
      }),
    },
    players: [
      { id: 'p3', gameId, name: 'North', seatIndex: 0 },
      { id: 'p0', gameId, name: 'East', seatIndex: 1 },
      { id: 'p1', gameId, name: 'South', seatIndex: 2 },
      { id: 'p2', gameId, name: 'West', seatIndex: 3 },
    ],
    hands: [
      {
        ...base.hands[0],
        id: 'explicit-before',
        gameId,
        handIndex: 0,
        dealerSeatIndex: 0,
        winnerSeatIndex: 0,
        winnerPlayerId: 'p0',
        discarderPlayerId: 'p1',
        deltasJson: JSON.stringify({ unit: 'Q', values: deltasQ }),
        computedJson: JSON.stringify({ settlementType: 'discard', fan: 3 }),
        nextRoundLabelZh: '東風東局',
      },
      {
        ...base.hands[0],
        id: 'explicit-after',
        gameId,
        handIndex: 1,
        dealerSeatIndex: 0,
        winnerSeatIndex: 0,
        winnerPlayerId: 'p3',
        discarderPlayerId: 'p0',
        deltasJson: JSON.stringify({ unit: 'Q', values: deltasQ }),
        computedJson: JSON.stringify({ settlementType: 'discard', fan: 3 }),
        nextRoundLabelZh: '東風東局',
      },
    ],
    seatBoundaries: [{
      id: `${gameId}:seat-boundary:1`,
      gameId,
      effectiveFromHandIndex: 1,
      seatMapping: { 0: 'p3', 1: 'p0', 2: 'p1', 3: 'p2' },
      reason: 'confirmed_reseat',
      createdAt: 1735690500000,
    }],
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

function createDrawPassBundle() {
  const ended = createEndedBundle();
  return {
    ...ended,
    game: {
      ...ended.game,
      id: 'g-draw-pass',
      title: 'Draw Pass Match',
      handsCount: 1,
      resultSummaryJson: JSON.stringify({ seatTotalsQ: [0, 0, 0, 0], playersCount: 4 }),
    },
    players: ended.players.map((player) => ({ ...player, gameId: 'g-draw-pass' })),
    hands: [{
      ...ended.hands[1],
      id: 'draw-pass',
      gameId: 'g-draw-pass',
      handIndex: 0,
      dealerSeatIndex: 0,
      computedJson: JSON.stringify({ settlementType: 'draw', dealerAction: 'pass' }),
      deltasJson: JSON.stringify([0, 0, 0, 0]),
      nextRoundLabelZh: '東風南局',
    }],
  };
}

function createMultiWindBundle() {
  const ended = createEndedBundle();
  const wins = [
    { winnerSeatIndex: 1, winnerPlayerId: 'p1', discarderPlayerId: 'p0', deltas: [-40, 40, 0, 0], next: '東風南局' },
    { winnerSeatIndex: 2, winnerPlayerId: 'p2', discarderPlayerId: 'p1', deltas: [0, -40, 40, 0], next: '東風西局' },
    { winnerSeatIndex: 3, winnerPlayerId: 'p3', discarderPlayerId: 'p2', deltas: [0, 0, -40, 40], next: '東風北局' },
    { winnerSeatIndex: 0, winnerPlayerId: 'p0', discarderPlayerId: 'p3', deltas: [40, 0, 0, -40], next: '南風東局' },
    { winnerSeatIndex: 1, winnerPlayerId: 'p1', discarderPlayerId: 'p0', deltas: [-40, 40, 0, 0], next: '南風南局' },
  ];
  return {
    ...ended,
    game: {
      ...ended.game,
      id: 'g-multi-wind',
      title: 'Multi Wind Match',
      handsCount: wins.length,
      currentRoundLabelZh: '南風南局',
      resultSummaryJson: JSON.stringify({ seatTotalsQ: [-40, 40, 0, 0], playersCount: 4 }),
    },
    players: ended.players.map((player) => ({ ...player, gameId: 'g-multi-wind' })),
    hands: wins.map((win, handIndex) => ({
      ...ended.hands[0],
      id: `multi-${handIndex}`,
      gameId: 'g-multi-wind',
      handIndex,
      dealerSeatIndex: handIndex % 4,
      winnerSeatIndex: win.winnerSeatIndex,
      winnerPlayerId: win.winnerPlayerId,
      discarderPlayerId: win.discarderPlayerId,
      deltasJson: JSON.stringify(win.deltas),
      nextRoundLabelZh: win.next,
    })),
  };
}

function createLongHistoryBundle() {
  const ended = createEndedBundle();
  const draw = ended.hands[1];
  return {
    ...ended,
    game: {
      ...ended.game,
      id: 'g-long-history',
      title: 'Long History Match',
      handsCount: 30,
      currentRoundLabelZh: '東風東局',
      resultSummaryJson: JSON.stringify({ seatTotalsQ: [0, 0, 0, 0], playersCount: 4 }),
    },
    players: ended.players.map((player) => ({ ...player, gameId: 'g-long-history' })),
    hands: Array.from({ length: 30 }, (_, handIndex) => ({
      ...draw,
      id: `long-${handIndex}`,
      gameId: 'g-long-history',
      handIndex,
      dealerSeatIndex: 0,
      nextRoundLabelZh: '東風東局',
      computedJson: JSON.stringify({ settlementType: 'draw', dealerAction: 'stick' }),
      deltasJson: JSON.stringify([0, 0, 0, 0]),
    })),
  };
}

function createEmptyHistoryBundle() {
  const ended = createEndedBundle();
  return {
    ...ended,
    game: {
      ...ended.game,
      id: 'g-empty-history',
      title: 'Empty History Match',
      handsCount: 0,
      currentRoundLabelZh: '東風東局',
      resultSummaryJson: JSON.stringify({ seatTotalsQ: [0, 0, 0, 0], playersCount: 4 }),
    },
    players: ended.players.map((player) => ({ ...player, gameId: 'g-empty-history' })),
    hands: [],
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
    setOptions: jest.fn(),
  } as any;

  function getHeaderShareItem() {
    const options = navigation.setOptions.mock.calls.at(-1)?.[0];
    return options?.unstable_headerRightItems?.()[0];
  }

  async function toggleHistory(tree: renderer.ReactTestRenderer) {
    await act(async () => {
      tree.root.findByProps({ testID: 'dashboard-history-toggle' }).props.onPress();
    });
  }

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
    expect(textContent).not.toContain('找數');
    expect(textContent).not.toContain('Alice → Bob');
    expect(textContent).toContain('牌局統計');
    expect(textContent).toContain('牌局紀錄');
    expect(textContent).toContain('Alice ×1');
    expect(textContent).toContain('規則摘要');
    expect(textContent).not.toContain('傳統番數');
    expect(textContent).toContain('—');
    expect(textContent).toContain('出銃');
    expect(textContent).not.toContain('traditionalFan');
    expect(textContent).not.toContain('halfGun');
    expect(getHeaderShareItem()).toMatchObject({
      type: 'button',
      label: '分享戰果',
      accessibilityLabel: '分享戰果',
      disabled: false,
      icon: { type: 'sfSymbol', name: 'square.and.arrow.up' },
      variant: 'plain',
      hidesSharedBackground: true,
      sharesBackground: false,
    });
    expect((tree! as renderer.ReactTestRenderer).root.findAllByType(AppButton).map((button) => button.props.label)).not.toContain('分享');

    const rankingStart = textContent.indexOf('玩家排名');
    const rankingEnd = textContent.indexOf('牌局統計');
    const rankingSlice = textContent.slice(rankingStart, rankingEnd);
    expect(rankingSlice).not.toContain('\n東\n');
    expect(rankingSlice).not.toContain('\n南\n');
    expect(rankingSlice).not.toContain('\n西\n');
    expect(rankingSlice).not.toContain('\n北\n');
    expect(textContent.indexOf('牌局統計')).toBeLessThan(textContent.indexOf('牌局紀錄'));
    expect(textContent.indexOf('牌局紀錄')).toBeLessThan(textContent.indexOf('規則摘要'));
    const historyToggle = (tree! as renderer.ReactTestRenderer).root.findByProps({ testID: 'dashboard-history-toggle' });
    expect(historyToggle.props.accessibilityRole).toBe('button');
    expect(historyToggle.props.accessibilityLabel).toBe('牌局紀錄，2 鋪');
    expect(historyToggle.props.accessibilityState).toEqual({ expanded: false, disabled: false });
    expect(textContent).toContain('牌局紀錄 · 2 鋪');
    expect(() => (tree! as renderer.ReactTestRenderer).root.findByProps({ testID: 'wind-section-東風' })).toThrow();
    expect(() => (tree! as renderer.ReactTestRenderer).root.findByProps({ testID: 'hand-row-h1' })).toThrow();
    expect((tree! as renderer.ReactTestRenderer).root.findByProps({ testID: 'dashboard-rules-toggle' }).props.accessibilityState).toEqual({ expanded: false });

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
    await act(async () => {
      await getHeaderShareItem().onPress();
    });
    const payload = shareSpy.mock.calls[0][0] as { message: string };
    expect(payload.message).not.toContain('Alice → Bob HK$8');
    expect(payload.message).not.toContain('找數');
    shareSpy.mockRestore();

    await toggleHistory(tree!);
    expect(root.findByProps({ testID: 'hand-row-h1' })).toBeTruthy();
    expect(root.findByProps({ testID: 'hand-row-h2' })).toBeTruthy();
    const timelineText = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(timelineText).toContain('東風東局');
    expect(timelineText).toContain('東風南局');

    await act(async () => {
      tree!.unmount();
    });
  });

  it('shares explicit-reseat totals and ranking from the canonical dashboard projection', async () => {
    const bundle = createExplicitReseatCanonicalBundle();
    expect(replayLocalGameBundle(bundle as any).authoritative).toBe(true);
    mockedGetGameBundle.mockResolvedValueOnce(bundle as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'explicit-reseat', name: 'GameDashboard', params: { gameId: bundle.game.id } } as any} />,
      );
      await Promise.resolve();
    });

    const text = tree!.root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(text).toContain('North');
    expect(text).toContain('+HK$6');
    expect(text).toContain('East');
    expect(text).toContain('+HK$4');
    expect(text).toContain('South');
    expect(text).toContain('-HK$6');

    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' as never });
    await act(async () => {
      await getHeaderShareItem().onPress();
    });
    const payload = shareSpy.mock.calls[0][0] as { message: string };
    expect(payload.message).toContain('1. North +HK$6');
    expect(payload.message).toContain('2. East +HK$4');
    expect(payload.message).toContain('3. West -HK$4');
    expect(payload.message).toContain('4. South -HK$6');
    expect(payload.message).not.toContain('North +HK$16');
    shareSpy.mockRestore();

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

  it('expands and collapses every hand as one chronological, non-interactive event timeline', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createEndedBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'k2', name: 'GameDashboard', params: { gameId: 'g-ended' } } as any} />,
      );
      await Promise.resolve();
    });

    const root = (tree! as renderer.ReactTestRenderer).root;
    const collapsedText = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    const historyToggle = root.findByProps({ testID: 'dashboard-history-toggle' });
    expect(collapsedText).toContain('牌局紀錄 · 2 鋪');
    expect(collapsedText).not.toContain('Bob 食糊 · Alice 出銃 · 4 番');
    expect(historyToggle.props.accessibilityState).toEqual({ expanded: false, disabled: false });
    expect(() => root.findByProps({ testID: 'hand-row-h1' })).toThrow();
    expect(root.findByType(SectionList).props.sections).toEqual([]);

    await toggleHistory(tree!);
    const allText = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(root.findByProps({ testID: 'dashboard-history-toggle' }).props.accessibilityState).toEqual({ expanded: true, disabled: false });
    expect(root.findByType(SectionList).props.sections).toHaveLength(1);
    expect(allText).toContain('Bob 食糊 · Alice 出銃 · 4 番');
    expect(allText).toContain('流局 · 留莊');
    expect(allText).not.toContain('載入更多');
    expect(() => root.findByProps({ testID: 'hands-filter-all' })).toThrow();
    expect(() => root.findByProps({ testID: 'hands-filter-wins' })).toThrow();
    expect(() => root.findByProps({ testID: 'hands-filter-draws' })).toThrow();
    expect(() => root.findByProps({ testID: 'jump-東風' })).toThrow();
    expect(() => root.findByProps({ testID: 'jump-南風' })).toThrow();

    const firstHand = root.findByProps({ testID: 'hand-row-h1' });
    const secondHand = root.findByProps({ testID: 'hand-row-h2' });
    expect(firstHand).toBeTruthy();
    expect(secondHand).toBeTruthy();
    expect(firstHand.props.onPress).toBeUndefined();
    expect(firstHand.props.accessibilityLabel).toBe('東風東局，Bob 食糊 · Alice 出銃 · 4 番');
    expect(secondHand.props.accessibilityLabel).toBe('東風南局，流局 · 留莊');
    expect(allText.indexOf('Bob 食糊 · Alice 出銃 · 4 番')).toBeLessThan(allText.indexOf('流局 · 留莊'));

    const firstHandText = firstHand.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(firstHandText).toContain('第 1 鋪');
    expect(firstHandText).toContain('+HK$20');
    expect(firstHandText).not.toContain('Bob +HK$20');
    expect(firstHandText).not.toContain('\n東\n');
    expect(firstHandText).not.toContain('\n南\n');
    expect(firstHandText).not.toContain('\n西\n');
    expect(firstHandText).not.toContain('\n北\n');

    const historyTitleStyle = StyleSheet.flatten(root.findByProps({ testID: 'dashboard-history-toggle' }).props.style);
    expect(historyTitleStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(historyTitleStyle.paddingVertical).toBeGreaterThanOrEqual(10);
    expect(historyTitleStyle.paddingRight).toBeGreaterThanOrEqual(10);
    const eventRowStyle = StyleSheet.flatten(root.findByProps({ testID: 'hand-event-row-h1' }).props.style);
    const gainStyle = StyleSheet.flatten(root.findByProps({ testID: 'hand-gain-h1' }).props.style);
    expect(historyTitleStyle.backgroundColor).toBeUndefined();
    expect(eventRowStyle).toMatchObject({ flexDirection: 'row', alignItems: 'flex-start' });
    expect(gainStyle).toMatchObject({ flexShrink: 0, textAlign: 'right', fontVariant: ['tabular-nums'] });
    expect(() => root.findByProps({ testID: 'hand-gain-h2' })).toThrow();

    const windSection = root.findByProps({ testID: 'wind-section-東風' });
    expect(windSection.props.onPress).toBeUndefined();
    expect(windSection.props.accessibilityState).toBeUndefined();
    const rulesCardStyle = StyleSheet.flatten(root.findAllByType(Card).at(-1)?.props.style);
    expect(rulesCardStyle.marginTop).toBe(16);
    expect(rulesCardStyle.marginBottom).toBe(16);

    await toggleHistory(tree!);
    expect(root.findByProps({ testID: 'dashboard-history-toggle' }).props.accessibilityState).toEqual({ expanded: false, disabled: false });
    expect(() => root.findByProps({ testID: 'hand-row-h1' })).toThrow();
    expect(root.findByProps({ testID: 'dashboard-history-toggle' })).toBeTruthy();

    await act(async () => {
      (tree! as renderer.ReactTestRenderer).unmount();
    });
  });

  it('shows a draw-pass event without zero-value delta chips', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createDrawPassBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'draw-pass', name: 'GameDashboard', params: { gameId: 'g-draw-pass' } } as any} />,
      );
      await Promise.resolve();
    });

    await toggleHistory(tree!);
    const row = tree!.root.findByProps({ testID: 'hand-row-draw-pass' });
    const rowText = row.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(rowText).toContain('流局 · 過莊');
    expect(rowText).not.toContain('HK$0');
    expect(row.props.accessibilityLabel).toBe('東風東局，流局 · 過莊');

    await act(async () => {
      tree!.unmount();
    });
  });

  it('keeps a 30-hand history compact until the global disclosure is opened', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createLongHistoryBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'long-history', name: 'GameDashboard', params: { gameId: 'g-long-history' } } as any} />,
      );
      await Promise.resolve();
    });

    const root = tree!.root;
    const toggle = root.findByProps({ testID: 'dashboard-history-toggle' });
    expect(toggle.props.accessibilityLabel).toBe('牌局紀錄，30 鋪');
    expect(root.findByType(SectionList).props.sections).toEqual([]);
    expect(() => root.findByProps({ testID: 'hand-row-long-0' })).toThrow();
    expect(() => root.findByProps({ testID: 'hand-row-long-29' })).toThrow();

    await toggleHistory(tree!);
    expect(root.findByProps({ testID: 'hand-row-long-0' })).toBeTruthy();
    const expandedSections = root.findByType(SectionList).props.sections;
    expect(expandedSections).toHaveLength(1);
    expect(expandedSections[0].data).toHaveLength(30);
    expect(expandedSections[0].data[29].hand.id).toBe('long-29');
    expect(root.findAllByType(Text).map((node) => String(node.props.children)).join('\n')).not.toContain('載入更多');

    await act(async () => {
      tree!.unmount();
    });
  });

  it('shows a disabled zero-hand disclosure instead of an expandable blank timeline', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createEmptyHistoryBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'empty-history', name: 'GameDashboard', params: { gameId: 'g-empty-history' } } as any} />,
      );
      await Promise.resolve();
    });

    const root = tree!.root;
    const toggle = root.findByProps({ testID: 'dashboard-history-toggle' });
    expect(toggle.props.accessibilityLabel).toBe('牌局紀錄，0 鋪');
    expect(toggle.props.disabled).toBe(true);
    expect(toggle.props.accessibilityState).toEqual({ expanded: false, disabled: true });
    expect(toggle.findAllByType(Text).map((node) => String(node.props.children)).join('\n')).toBe('牌局紀錄 · 0 鋪');
    expect(root.findByType(SectionList).props.sections).toEqual([]);
    expect(root.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('hand-row-'))).toHaveLength(0);

    await act(async () => {
      tree!.unmount();
    });
  });

  it('keeps long timeline identities and a large winner gain in the flex-safe event row', async () => {
    const bundle = createEndedBundle();
    bundle.players = bundle.players.map((player) => ({
      ...player,
      name: player.id === 'p1'
        ? 'VeryLongWinnerNameThatNeedsToWrap'
        : player.id === 'p0'
          ? 'VeryLongDiscarderNameThatNeedsToWrap'
          : player.name,
    }));
    bundle.hands = bundle.hands.map((hand, index) => (
      index === 0
        ? { ...hand, deltasJson: JSON.stringify([-5120, 5120, 0, 0]) }
        : hand
    )) as typeof bundle.hands;
    bundle.game.resultSummaryJson = JSON.stringify({
      seatTotalsQ: [-5120, 5120, 0, 0],
      playersCount: 4,
    });
    mockedGetGameBundle.mockResolvedValueOnce(bundle as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'long-timeline', name: 'GameDashboard', params: { gameId: bundle.game.id } } as any} />,
      );
      await Promise.resolve();
    });

    await toggleHistory(tree!);
    const row = tree!.root.findByProps({ testID: 'hand-row-h1' });
    const rowText = row.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(rowText).toContain('VeryLongWinnerNameThatNeedsToWrap 食糊 · VeryLongDiscarderNameThatNeedsToWrap 出銃 · 4 番');
    expect(rowText).toContain('+HK$1280');
    expect(rowText).not.toContain('VeryLongWinnerNameThatNeedsToWrap +HK$1280');
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'hand-event-row-h1' }).props.style)).toMatchObject({
      flexDirection: 'row',
      alignItems: 'flex-start',
    });

    await act(async () => {
      tree!.unmount();
    });
  });

  it('keeps wind grouping visual while rendering a multi-wind history in full', async () => {
    mockedGetGameBundle.mockResolvedValueOnce(createMultiWindBundle() as any);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'multi-wind', name: 'GameDashboard', params: { gameId: 'g-multi-wind' } } as any} />,
      );
      await Promise.resolve();
    });

    const root = tree!.root;
    expect(root.findByProps({ testID: 'dashboard-history-toggle' }).props.accessibilityLabel).toBe('牌局紀錄，5 鋪');
    expect(() => root.findByProps({ testID: 'wind-section-東風' })).toThrow();
    await toggleHistory(tree!);
    expect(root.findByProps({ testID: 'wind-section-東風' })).toBeTruthy();
    expect(root.findByProps({ testID: 'wind-section-南風' })).toBeTruthy();
    expect(root.findByProps({ testID: 'hand-row-multi-0' })).toBeTruthy();
    expect(root.findByProps({ testID: 'hand-row-multi-4' })).toBeTruthy();
    const text = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(text.indexOf('東風北局')).toBeLessThan(text.indexOf('南風東局'));

    await act(async () => {
      tree!.unmount();
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
    expect(root.findByProps({ testID: 'dashboard-history-toggle' }).props.accessibilityLabel).toBe('牌局紀錄，1 鋪');
    await toggleHistory(tree!);
    const allText = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(allText).toContain('Bob 自摸 · 10 番');
    expect(allText).not.toContain('Bob 自摸 · 36 番');

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
    await toggleHistory(tree!);
    const allText = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(allText).toContain('Bob 食糊 · Alice 出銃 · 10 番');
    expect(allText).not.toContain('Bob 食糊 · Alice 出銃 · 32 番');

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

    const shareButton = getHeaderShareItem();
    const allText = (tree! as renderer.ReactTestRenderer).root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');

    expect(shareButton.disabled).toBe(true);
    expect(allText).toContain('此頁僅供已結束對局查看。');
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockClear();

    await act(async () => {
      await shareButton.onPress();
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

    const shareButton = getHeaderShareItem();
    expect(shareButton).toBeTruthy();

    await act(async () => {
      await shareButton.onPress();
    });

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const payload = shareSpy.mock.calls[0][0] as { message: string };
    expect(payload.message).toContain('Ended Match');
    expect(payload.message).toContain('Ended Match — 01/01/2025');
    expect(payload.message).toContain('牌局戰果');
    expect(payload.message).not.toContain('找數');
    expect(payload.message).not.toContain('Alice → Bob HK$20');
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

    const shareButton = getHeaderShareItem();
    await act(async () => {
      await shareButton.onPress();
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

    await toggleHistory(tree!);
    const timelineText = tree!.root.findByProps({ testID: 'hand-row-rt-h4' })
      .findAllByType(Text)
      .map((node) => String(node.props.children))
      .join('\n');
    expect(timelineText).toContain('Bob 食糊 · Carol 出銃 · 4 番');

    const shareButton = getHeaderShareItem();
    await act(async () => {
      await shareButton.onPress();
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

  it('keeps zero-balance results readable and treats native share cancellation as normal', async () => {
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
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <GameDashboardScreen navigation={navigation} route={{ key: 'zero', name: 'GameDashboard', params: { gameId: bundle.game.id } } as any} />,
      );
      await Promise.resolve();
    });

    const root = tree!.root;
    const text = root.findAllByType(Text).map((node) => String(node.props.children)).join('\n');
    expect(text).not.toContain('無需找數');
    expect((text.match(/🥇/g) ?? [])).toHaveLength(4);
    expect(text).toContain('A very long English player name that should not hide the balance');
    expect(text).toContain('0');
    expect(() => root.findByProps({ testID: 'wind-section-東風' })).toThrow();
    expect(root.findByProps({ testID: 'dashboard-history-toggle' }).props.accessibilityState).toEqual({ expanded: false, disabled: false });
    expect(root.findByProps({ testID: 'dashboard-rules-toggle' }).props.accessibilityState).toEqual({ expanded: false });

    const shareButton = getHeaderShareItem();
    await act(async () => {
      shareButton.onPress();
      shareButton.onPress();
    });
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect((shareSpy.mock.calls[0][0] as { message: string }).message).not.toContain('找數');
    await act(async () => {
      resolveShare?.({ action: 'dismissedAction' as never });
      await Promise.resolve();
    });
    expect(alertSpy).not.toHaveBeenCalledWith('未能分享結果', '請稍後再試。');

    alertSpy.mockRestore();
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
      await getHeaderShareItem().onPress();
    });
    expect(alertSpy).toHaveBeenCalledWith('未能分享結果', '請稍後再試。');

    alertSpy.mockRestore();
    shareSpy.mockRestore();
    await act(async () => {
      tree!.unmount();
    });
  });
});
