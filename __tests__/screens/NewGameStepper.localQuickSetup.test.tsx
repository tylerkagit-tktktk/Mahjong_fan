import React from 'react';
import { TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import en from '../../src/i18n/locales/en.json';
import zhHans from '../../src/i18n/locales/zh-Hans.json';
import zhHant from '../../src/i18n/locales/zh-Hant.json';
import NewGameStepperScreen from '../../src/screens/NewGameStepperScreen';
import PlayersSection from '../../src/screens/newGameStepper/sections/PlayersSection';
import ScoringSection from '../../src/screens/newGameStepper/sections/ScoringSection';
import SegmentedControl from '../../src/components/SegmentedControl';
import StepperNumberInput from '../../src/components/StepperNumberInput';
import { createGameWithPlayers } from '../../src/db/repo';

type MockLanguage = 'zh-Hant' | 'zh-Hans' | 'en';
let mockLanguage: MockLanguage = 'zh-Hant';

jest.mock('@react-navigation/native', () => {
  const ReactLib = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => ReactLib.useEffect(callback, [callback]),
  };
});

jest.mock('../../src/db/repo', () => ({
  createGameWithPlayers: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/settings/useAppPreferences', () => ({
  useAppPreferences: () => ({ defaultCurrencyCode: 'HKD' }),
}));

jest.mock('../../src/i18n/useAppLanguage', () => {
  const locales = {
    'zh-Hant': require('../../src/i18n/locales/zh-Hant.json'),
    'zh-Hans': require('../../src/i18n/locales/zh-Hans.json'),
    en: require('../../src/i18n/locales/en.json'),
  };
  const translate = (key: string) => locales[mockLanguage][key] ?? key;
  return {
    useAppLanguage: () => ({
      language: mockLanguage,
      t: translate,
    }),
  };
});

jest.mock('../../src/services/cloud/authRepo', () => ({
  ensureSession: jest.fn().mockResolvedValue({ uid: 'host-1', provider: 'google' }),
  getCurrentSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/services/cloud/profileRepo', () => ({
  getProfile: jest.fn().mockResolvedValue(null),
  normalizeDisplayName: jest.fn().mockReturnValue('Host'),
  updateProfile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/cloud/roomRepo', () => ({
  addTemporaryPlayers: jest.fn().mockResolvedValue([]),
  createRoom: jest.fn(),
  deleteRoomAndFallbackToLocal: jest.fn().mockResolvedValue(undefined),
  getOrCreateActiveInvite: jest.fn(),
  getRoom: jest.fn().mockResolvedValue(null),
  recoverHostedRoom: jest.fn().mockResolvedValue({ kind: 'none', retryAt: null }),
  startRoom: jest.fn(),
  subscribeRoomPlayers: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../../src/services/cloud/storage', () => ({
  clearActiveHostedRoomPointer: jest.fn().mockResolvedValue(undefined),
  clearPendingHostedRoomCleanup: jest.fn().mockResolvedValue(undefined),
  loadActiveHostedRoomDraft: jest.fn().mockResolvedValue(null),
  loadActiveHostedRoomPointer: jest.fn().mockResolvedValue(null),
  loadPendingHostedRoomCleanup: jest.fn().mockResolvedValue(null),
  saveActiveHostedRoomDraft: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockedCreateGameWithPlayers = createGameWithPlayers as jest.MockedFunction<typeof createGameWithPlayers>;

async function renderScreen(entryMode?: 'local' | 'multiplayer') {
  const navigation = {
    replace: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as any;
  const route = {
    key: `new-game-${entryMode ?? 'local'}`,
    name: 'NewGameStepper',
    params: entryMode ? { entryMode } : undefined,
  } as any;

  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<NewGameStepperScreen navigation={navigation} route={route} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return { tree: tree!, navigation };
}

function nativeText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType('Text' as any)
    .map((node) => node.children.join(''))
    .join(' ');
}

describe('NewGameStepper Local Quick Setup', () => {
  beforeEach(() => {
    mockLanguage = 'zh-Hant';
    jest.clearAllMocks();
    mockedCreateGameWithPlayers.mockResolvedValue(undefined);
  });

  it('shows players before a compact live rules summary and hides Local sync controls', async () => {
    const { tree } = await renderScreen();

    const orderedSections = tree.root
      .findAll((node) =>
        ['new-game-title-section', 'new-game-players-section', 'new-game-local-rules-summary'].includes(
          String(node.props.testID ?? ''),
        ) && node.parent?.props.testID !== node.props.testID,
      )
      .map((node) => node.props.testID);
    expect(orderedSections).toEqual([
      'new-game-title-section',
      'new-game-players-section',
      'new-game-local-rules-summary',
    ]);
    expect(tree.root.findAllByProps({ testID: 'new-game-scoring-section' })).toHaveLength(0);
    expect(nativeText(tree)).toContain('傳統番數 · 二五雞 · 全銃');
    expect(nativeText(tree)).toContain('3番起糊 · 10番爆棚');
    expect(nativeText(tree)).not.toContain('加入同步玩家');
    expect(nativeText(tree)).not.toContain('先設定規則、玩家同起莊方式');

    const playerInputs = tree.root
      .findAllByType(TextInput)
      .filter((input) => ['東位玩家名稱', '南位玩家名稱', '西位玩家名稱', '北位玩家名稱'].includes(input.props.placeholder));
    expect(playerInputs).toHaveLength(4);
    expect(playerInputs.map((input) => input.props.accessibilityLabel)).toEqual([
      '東位玩家名稱',
      '南位玩家名稱',
      '西位玩家名稱',
      '北位玩家名稱',
    ]);

    const playersSection = tree.root.findByType(PlayersSection);
    const focusSouth = jest.fn();
    playersSection.props.manualPlayerRefs.current[1] = { focus: focusSouth };
    playerInputs[0].props.onSubmitEditing();
    expect(focusSouth).toHaveBeenCalledTimes(1);
    expect(playersSection.props.quickSetup).toBe(true);
    expect(playersSection.props.showSyncControl).toBe(false);
    expect(playersSection.props.seatMode).toBe('manual');
    await act(async () => playersSection.props.onSeatModeChange('auto'));
    expect(tree.root.findByType(PlayersSection).props.seatMode).toBe('auto');

    await act(async () => tree.unmount());
  });

  it('opens the existing rule controls on the same state and updates the summary after Done', async () => {
    const { tree } = await renderScreen();

    await act(async () => tree.root.findByProps({ testID: 'new-game-local-edit-rules' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'new-game-local-rules-editor' })).toBeTruthy();
    expect(tree.root.findByType(ScoringSection)).toBeTruthy();

    let controls = tree.root.findAllByType(SegmentedControl);
    expect(controls[0].props.value).toBe('traditionalFan');
    expect(controls[1].props.value).toBe('fullGun');
    expect(controls[2].props.value).toBe('TWO_FIVE_CHICKEN');
    expect(controls[3].props.value).toBe(10);

    await act(async () => controls[1].props.onChange('halfGun'));
    controls = tree.root.findAllByType(SegmentedControl);
    await act(async () => controls[2].props.onChange('FIVE_ONE'));
    controls = tree.root.findAllByType(SegmentedControl);
    await act(async () => controls[3].props.onChange(13));
    const minFanStepper = tree.root.findAllByType(StepperNumberInput)[0];
    await act(async () => minFanStepper.props.onChangeText('5'));

    await act(async () => tree.root.findByProps({ testID: 'new-game-local-rules-done' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'new-game-local-rules-editor' })).toHaveLength(0);
    expect(nativeText(tree)).toContain('傳統番數 · 五一 · 半銃');
    expect(nativeText(tree)).toContain('5番起糊 · 13番爆棚');

    await act(async () => tree.root.findByProps({ testID: 'new-game-local-edit-rules' }).props.onPress());
    controls = tree.root.findAllByType(SegmentedControl);
    expect(controls[1].props.value).toBe('halfGun');
    expect(controls[2].props.value).toBe('FIVE_ONE');
    expect(controls[3].props.value).toBe(13);

    await act(async () => tree.unmount());
  });

  it('summarizes custom scoring with only the settings editable in custom mode', async () => {
    const { tree } = await renderScreen();

    await act(async () => tree.root.findByProps({ testID: 'new-game-local-edit-rules' }).props.onPress());
    let controls = tree.root.findAllByType(SegmentedControl);
    await act(async () => controls[0].props.onChange('customTable'));
    await act(async () => tree.root.findByProps({ testID: 'new-game-local-rules-done' }).props.onPress());

    const summaryText = nativeText(tree);
    expect(summaryText).toContain('自訂番數 · 每番 HK$1');
    expect(summaryText).toContain('3番起糊 · 10番爆棚');
    expect(summaryText).not.toContain('傳統番數');
    expect(summaryText).not.toContain('二五雞');
    expect(summaryText).not.toContain('全銃');

    await act(async () => tree.root.findByProps({ testID: 'new-game-local-edit-rules' }).props.onPress());
    controls = tree.root.findAllByType(SegmentedControl);
    expect(controls[0].props.value).toBe('customTable');

    await act(async () => tree.unmount());
  });

  it('starts Local through the existing create path without a routine confirmation step', async () => {
    const { tree, navigation } = await renderScreen('local');
    const inputs = tree.root.findAllByType(TextInput);
    const valuesByPlaceholder: Record<string, string> = {
      '未命名對局': '星期五牌局',
      '東位玩家名稱': '東家',
      '南位玩家名稱': '南家',
      '西位玩家名稱': '西家',
      '北位玩家名稱': '北家',
    };

    for (const input of inputs) {
      const nextValue = valuesByPlaceholder[input.props.placeholder];
      if (nextValue) {
        await act(async () => input.props.onChangeText(nextValue));
      }
    }

    const startAction = tree.root.findByProps({ testID: 'new-game-create-local' });
    expect(startAction.props.accessibilityLabel).toBe('開始牌局');
    await act(async () => {
      startAction.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedCreateGameWithPlayers).toHaveBeenCalledTimes(1);
    expect(mockedCreateGameWithPlayers.mock.calls[0][0].title).toBe('星期五牌局');
    expect(mockedCreateGameWithPlayers.mock.calls[0][1].map((player) => player.name)).toEqual(['東家', '南家', '西家', '北家']);
    expect(navigation.replace).toHaveBeenCalledWith('GameTable', expect.objectContaining({ gameId: expect.any(String) }));
    expect(tree.root.findAllByProps({ testID: 'create-confirm-modal' })).toHaveLength(0);

    await act(async () => tree.unmount());
  });

  it('keeps multiplayer on the existing full scoring and sync setup', async () => {
    const { tree } = await renderScreen('multiplayer');

    expect(tree.root.findAllByProps({ testID: 'new-game-local-rules-summary' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'new-game-scoring-section' })).toBeTruthy();
    expect(tree.root.findByType(ScoringSection)).toBeTruthy();
    const playersSection = tree.root.findByType(PlayersSection);
    expect(playersSection.props.quickSetup).toBe(false);
    expect(playersSection.props.showSyncControl).toBe(true);
    expect(playersSection.props.syncEntryIntent).toBe(true);
    expect(nativeText(tree)).toContain('開多人枱');
    expect(tree.root.findByProps({ testID: 'new-game-create-local' }).props.accessibilityLabel).toBe('建立牌局');

    await act(async () => tree.unmount());
  });

  it('keeps Local Quick Setup copy complete across all supported locales', () => {
    const requiredKeys = [
      'newGame.localQuick.rulesTitle',
      'newGame.localQuick.rulesEdit',
      'newGame.localQuick.rulesEditAccessibility',
      'newGame.localQuick.rulesEditorTitle',
      'newGame.localQuick.rulesClose',
      'newGame.localQuick.rulesDone',
      'newGame.localQuick.start',
      'newGame.localQuick.summary.customScoring',
      'newGame.localQuick.summary.minFan',
      'newGame.localQuick.summary.cap',
      'newGame.localQuick.summary.noCap',
      'newGame.localQuick.summary.unitPerFan',
    ] as const;

    for (const key of requiredKeys) {
      expect(en[key]).toBeTruthy();
      expect(zhHans[key]).toBeTruthy();
      expect(zhHant[key]).toBeTruthy();
    }
  });

  it('renders concise default summary copy in every supported locale', async () => {
    const expectedByLanguage: Record<MockLanguage, [string, string]> = {
      'zh-Hant': ['傳統番數 · 二五雞 · 全銃', '3番起糊 · 10番爆棚'],
      'zh-Hans': ['传统番数 · 二五鸡 · 全铳', '3番起糊 · 10番爆棚'],
      en: ['Traditional fan · 2-5 Chicken · Full Gun', 'Win at 3 fan · Boom cap at 10 fan'],
    };

    for (const language of Object.keys(expectedByLanguage) as MockLanguage[]) {
      mockLanguage = language;
      const { tree } = await renderScreen();
      const summaryText = nativeText(tree);
      expect(summaryText).toContain(expectedByLanguage[language][0]);
      expect(summaryText).toContain(expectedByLanguage[language][1]);
      await act(async () => tree.unmount());
    }
  });
});
