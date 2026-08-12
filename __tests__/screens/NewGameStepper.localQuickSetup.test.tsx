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
import CreateConfirmModal from '../../src/screens/newGameStepper/sections/CreateConfirmModal';
import MultiplayerHostSetup from '../../src/screens/newGameStepper/sections/MultiplayerHostSetup';
import InviteShareModal from '../../src/components/InviteShareModal';
import { createGameWithPlayers } from '../../src/db/repo';
import {
  addTemporaryPlayers,
  createRoom,
  deleteRoomAndFallbackToLocal,
  recoverHostedRoom,
  startRoom,
  updateOpenRoomRules,
} from '../../src/services/cloud/roomRepo';
import { updateProfile } from '../../src/services/cloud/profileRepo';
import { getCurrentSession } from '../../src/services/cloud/authRepo';
import { loadActiveHostedRoomPointer } from '../../src/services/cloud/storage';

type MockLanguage = 'zh-Hant' | 'zh-Hans' | 'en';
let mockLanguage: MockLanguage = 'zh-Hant';
let mockSyncPlayers: any[] = [];

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
  subscribeRoomPlayers: jest.fn((_roomId: string, _uid: string, callback: (players: any[]) => void) => {
    callback(mockSyncPlayers);
    return jest.fn();
  }),
  updateOpenRoomRules: jest.fn(),
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
const mockedCreateRoom = createRoom as jest.Mock;
const mockedAddTemporaryPlayers = addTemporaryPlayers as jest.MockedFunction<typeof addTemporaryPlayers>;
const mockedDeleteRoomAndFallbackToLocal = deleteRoomAndFallbackToLocal as jest.MockedFunction<typeof deleteRoomAndFallbackToLocal>;
const mockedStartRoom = startRoom as jest.MockedFunction<typeof startRoom>;
const mockedUpdateOpenRoomRules = updateOpenRoomRules as jest.MockedFunction<typeof updateOpenRoomRules>;
const mockedUpdateProfile = updateProfile as jest.MockedFunction<typeof updateProfile>;
const mockedGetCurrentSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;
const mockedRecoverHostedRoom = recoverHostedRoom as jest.MockedFunction<typeof recoverHostedRoom>;
const mockedLoadActiveHostedRoomPointer = loadActiveHostedRoomPointer as jest.MockedFunction<typeof loadActiveHostedRoomPointer>;

const MULTIPLAYER_ROOM_ID = 'room_1700000000000_abcdef';

const multiplayerRoom = {
  roomId: MULTIPLAYER_ROOM_ID,
  title: '星期五多人牌局',
  hostUid: 'host-1',
  status: 'open',
  maxSeats: 4,
  memberCap: 8,
  memberCount: 1,
  currentVersion: 1,
  currentHandIndex: 0,
  activeLineupVersion: 0,
  rulesSnapshot: {},
  createdAt: 1,
  updatedAt: 1,
} as const;

const multiplayerInvite = {
  roomId: MULTIPLAYER_ROOM_ID,
  token: 'invite-token',
  expiresAt: Date.now() + 60_000,
  deepLink: `mahjongfan://join?roomId=${MULTIPLAYER_ROOM_ID}&token=invite-token`,
};

async function renderScreen(entryMode?: 'local' | 'multiplayer') {
  const navigation = {
    replace: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
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
    mockSyncPlayers = [];
    mockedCreateGameWithPlayers.mockResolvedValue(undefined);
    mockedAddTemporaryPlayers.mockResolvedValue([]);
    mockedCreateRoom.mockResolvedValue({ ok: true, kind: 'created', room: multiplayerRoom, invite: multiplayerInvite });
    mockedStartRoom.mockResolvedValue({ ok: true, nextVersion: 2, nextHandIndex: 0 });
    mockedUpdateOpenRoomRules.mockResolvedValue(multiplayerRoom);
    mockedGetCurrentSession.mockResolvedValue(null);
    mockedRecoverHostedRoom.mockResolvedValue({ kind: 'none', retryAt: null });
    mockedLoadActiveHostedRoomPointer.mockResolvedValue(null);
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
    expect(controls.some((control) => control.props.value === 'traditionalFan')).toBe(true);
    expect(controls.some((control) => control.props.value === 'fullGun')).toBe(true);
    expect(controls.some((control) => control.props.value === 'TWO_FIVE_CHICKEN')).toBe(true);
    expect(controls.some((control) => control.props.value === 10)).toBe(true);

    await act(async () => controls.find((control) => control.props.value === 'fullGun')?.props.onChange('halfGun'));
    controls = tree.root.findAllByType(SegmentedControl);
    await act(async () => controls.find((control) => control.props.value === 'TWO_FIVE_CHICKEN')?.props.onChange('FIVE_ONE'));
    controls = tree.root.findAllByType(SegmentedControl);
    await act(async () => controls.find((control) => control.props.value === 10)?.props.onChange(13));
    const minFanStepper = tree.root.findAllByType(StepperNumberInput)[0];
    await act(async () => minFanStepper.props.onChangeText('5'));

    await act(async () => tree.root.findByProps({ testID: 'new-game-local-rules-done' }).props.onPress());
    expect(tree.root.findAllByProps({ testID: 'new-game-local-rules-editor' })).toHaveLength(0);
    expect(nativeText(tree)).toContain('傳統番數 · 五一 · 半銃');
    expect(nativeText(tree)).toContain('5番起糊 · 13番爆棚');

    await act(async () => tree.root.findByProps({ testID: 'new-game-local-edit-rules' }).props.onPress());
    controls = tree.root.findAllByType(SegmentedControl);
    expect(controls.some((control) => control.props.value === 'halfGun')).toBe(true);
    expect(controls.some((control) => control.props.value === 'FIVE_ONE')).toBe(true);
    expect(controls.some((control) => control.props.value === 13)).toBe(true);

    await act(async () => tree.unmount());
  });

  it('summarizes custom scoring with only the settings editable in custom mode', async () => {
    const { tree } = await renderScreen();

    await act(async () => tree.root.findByProps({ testID: 'new-game-local-edit-rules' }).props.onPress());
    let controls = tree.root.findAllByType(SegmentedControl);
    await act(async () => controls.find((control) => control.props.value === 'traditionalFan')?.props.onChange('customTable'));
    await act(async () => tree.root.findByProps({ testID: 'new-game-local-rules-done' }).props.onPress());

    const summaryText = nativeText(tree);
    expect(summaryText).toContain('自訂番數 · 每番 HK$1');
    expect(summaryText).toContain('3番起糊 · 10番爆棚');
    expect(summaryText).not.toContain('傳統番數');
    expect(summaryText).not.toContain('二五雞');
    expect(summaryText).not.toContain('全銃');

    await act(async () => tree.root.findByProps({ testID: 'new-game-local-edit-rules' }).props.onPress());
    controls = tree.root.findAllByType(SegmentedControl);
    expect(controls.some((control) => control.props.value === 'customTable')).toBe(true);

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

  it('shows focused multiplayer pre-room setup without local seats or early persistence', async () => {
    const { tree } = await renderScreen('multiplayer');

    expect(tree.root.findByProps({ testID: 'new-game-multiplayer-pre-room' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'new-game-multiplayer-host-name' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'new-game-multiplayer-rules-summary' })).toBeTruthy();
    expect(tree.root.findAllByType(PlayersSection)).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'new-game-scoring-section' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'new-game-create-local' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'new-game-create-multiplayer-room' }).props.accessibilityLabel).toBe('建立多人牌局');

    const seatInputs = tree.root
      .findAllByType(TextInput)
      .filter((input) => ['東位玩家名稱', '南位玩家名稱', '西位玩家名稱', '北位玩家名稱'].includes(input.props.placeholder));
    expect(seatInputs).toHaveLength(0);
    expect(mockedCreateRoom).not.toHaveBeenCalled();
    expect(mockedUpdateProfile).not.toHaveBeenCalled();

    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-edit-rules' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'new-game-local-rules-editor' })).toBeTruthy();
    expect(tree.root.findByType(ScoringSection)).toBeTruthy();

    await act(async () => tree.unmount());
  });

  it('creates the room only from the explicit multiplayer action and enters host setup', async () => {
    mockSyncPlayers = [
      {
        playerId: 'host-1', roomId: MULTIPLAYER_ROOM_ID, kind: 'member', uid: 'host-1', displayName: 'Host-A',
        avatarUrl: null, isHost: true, isSelf: true, joinedAt: 1,
      },
    ];
    const { tree } = await renderScreen('multiplayer');

    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-title' }).props.onChangeText('星期五多人牌局'));
    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-host-name' }).props.onChangeText('Host-A'));
    await act(async () => {
      tree.root.findByProps({ testID: 'new-game-create-multiplayer-room' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedUpdateProfile).toHaveBeenCalledWith('host-1', { displayName: 'Host-A' });
    expect(mockedCreateRoom).toHaveBeenCalledWith(expect.objectContaining({
      hostUid: 'host-1',
      hostDisplayName: 'Host-A',
      title: '星期五多人牌局',
      rulesSnapshot: expect.objectContaining({ serializedRules: expect.any(String) }),
    }));
    expect(tree.root.findByProps({ testID: 'new-game-multiplayer-host-setup' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'new-game-share-invite' })).toBeTruthy();
    expect(nativeText(tree)).not.toContain(MULTIPLAYER_ROOM_ID);
    expect(nativeText(tree)).toContain('已加入 1 人');
    expect(nativeText(tree)).not.toContain('/ 8');
    expect(nativeText(tree)).toContain('房主：Host-A');
    expect(tree.root.findByProps({ testID: 'new-game-add-temporary-player' })).toBeTruthy();
    expect(
      tree.root.findAll(
        (node) =>
          /^new-game-sync-seat-[0-3]$/.test(String(node.props.testID ?? '')) &&
          node.parent?.props.testID !== node.props.testID,
      ),
    ).toHaveLength(4);
    expect(tree.root.findByProps({ testID: 'new-game-start-synced-room' }).props.accessibilityLabel).toBe('開始牌局');

    await act(async () => {
      tree.root.findByProps({ testID: 'new-game-share-invite' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(tree.root.findByType(InviteShareModal).props.visible).toBe(true);
    expect(tree.root.findByType(InviteShareModal).props.invite).toEqual(multiplayerInvite);

    await act(async () => tree.unmount());
  });

  it('prompts instead of silently falling back when only the host is joined', async () => {
    const { tree, navigation } = await renderScreen('multiplayer');
    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-title' }).props.onChangeText('星期五多人牌局'));
    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-host-name' }).props.onChangeText('Host-A'));
    await act(async () => {
      tree.root.findByProps({ testID: 'new-game-create-multiplayer-room' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => tree.root.findByProps({ testID: 'new-game-start-synced-room' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'new-game-insufficient-players-modal' })).toBeTruthy();
    expect(mockedDeleteRoomAndFallbackToLocal).not.toHaveBeenCalled();
    expect(mockedCreateGameWithPlayers).not.toHaveBeenCalled();

    await act(async () => {
      tree.root.findByProps({ testID: 'new-game-insufficient-invite' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedDeleteRoomAndFallbackToLocal).not.toHaveBeenCalled();
    expect(tree.root.findByType(InviteShareModal).props.visible).toBe(true);
    await act(async () => tree.root.findByType(InviteShareModal).props.onClose());
    await act(async () => tree.root.findByProps({ testID: 'new-game-start-synced-room' }).props.onPress());

    await act(async () => {
      tree.root.findByProps({ testID: 'new-game-insufficient-return-local' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedDeleteRoomAndFallbackToLocal).toHaveBeenCalledWith(MULTIPLAYER_ROOM_ID, 'host-1');
    expect(navigation.replace).toHaveBeenCalledWith('NewGameStepper', expect.objectContaining({
      entryMode: 'local',
      prefill: expect.objectContaining({ title: '星期五多人牌局', serializedRules: expect.any(String) }),
    }));
    expect(mockedCreateGameWithPlayers).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });

  it('keeps temporary names local until a validated multiplayer start with enough joined players', async () => {
    mockSyncPlayers = [
      {
        playerId: 'host-1', roomId: MULTIPLAYER_ROOM_ID, kind: 'member', uid: 'host-1', displayName: 'Host-A',
        avatarUrl: null, isHost: true, isSelf: true, joinedAt: 1,
      },
      {
        playerId: 'friend-1', roomId: MULTIPLAYER_ROOM_ID, kind: 'member', uid: 'friend-1', displayName: 'Tyler',
        avatarUrl: null, isHost: false, isSelf: false, joinedAt: 2,
      },
    ];
    mockedAddTemporaryPlayers.mockResolvedValue([
      {
        playerId: 'temp-west', roomId: MULTIPLAYER_ROOM_ID, kind: 'temporary', uid: null, displayName: '西家',
        avatarUrl: null, isHost: false, isSelf: false, joinedAt: 3,
      },
      {
        playerId: 'temp-north', roomId: MULTIPLAYER_ROOM_ID, kind: 'temporary', uid: null, displayName: '北家',
        avatarUrl: null, isHost: false, isSelf: false, joinedAt: 4,
      },
    ]);

    const { tree, navigation } = await renderScreen('multiplayer');
    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-title' }).props.onChangeText('星期五多人牌局'));
    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-host-name' }).props.onChangeText('Host-A'));
    await act(async () => {
      tree.root.findByProps({ testID: 'new-game-create-multiplayer-room' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    if (tree.root.findByType(MultiplayerHostSetup).props.selectedPlayerId !== 'host-1') {
      await act(async () => tree.root.findByType(MultiplayerHostSetup).props.onSelectPlayer('host-1'));
    }
    await act(async () => tree.root.findByType(MultiplayerHostSetup).props.onAssignPlayerToSeat(0));
    await act(async () => tree.root.findByType(MultiplayerHostSetup).props.onSelectPlayer('friend-1'));
    await act(async () => tree.root.findByType(MultiplayerHostSetup).props.onAssignPlayerToSeat(1));
    expect(nativeText(tree)).toContain('已加入 2 人');
    expect(nativeText(tree)).not.toContain('/ 8');
    await act(async () => tree.root.findByProps({ testID: 'new-game-add-temporary-player' }).props.onPress());

    const temporaryInputs = tree.root.findAllByType(TextInput);
    await act(async () => temporaryInputs.find((input) => input.props.testID === 'new-game-temporary-player-2')?.props.onChangeText('西家'));
    await act(async () => temporaryInputs.find((input) => input.props.testID === 'new-game-temporary-player-3')?.props.onChangeText('北家'));
    await act(async () => tree.root.findByProps({ testID: 'new-game-save-temporary-players' }).props.onPress());
    expect(mockedAddTemporaryPlayers).not.toHaveBeenCalled();
    expect(tree.root.findByType(MultiplayerHostSetup).props.seats.map((seat: any) => seat.displayName)).toEqual([
      'Host-A', 'Tyler', '西家', '北家',
    ]);

    await act(async () => tree.root.findByProps({ testID: 'new-game-start-synced-room' }).props.onPress());
    expect(tree.root.findByType(CreateConfirmModal).props.visible).toBe(true);
    await act(async () => {
      tree.root.findByType(CreateConfirmModal).props.onConfirm();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedAddTemporaryPlayers).toHaveBeenCalledWith({
      roomId: MULTIPLAYER_ROOM_ID,
      createdByUid: 'host-1',
      displayNames: ['西家', '北家'],
    });
    expect(mockedStartRoom).toHaveBeenCalledWith({
      roomId: MULTIPLAYER_ROOM_ID,
      startedByUid: 'host-1',
      baseVersion: 1,
      nextSeats: { '0': 'host-1', '1': 'friend-1', '2': 'temp-west', '3': 'temp-north' },
    });
    expect(navigation.replace).toHaveBeenCalledWith('MultiplayerGameTable', { roomId: MULTIPLAYER_ROOM_ID });

    await act(async () => tree.unmount());
  });

  it('keeps multiplayer rules editable after room creation and persists only on editor completion', async () => {
    const { tree } = await renderScreen('multiplayer');
    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-title' }).props.onChangeText('星期五多人牌局'));
    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-host-name' }).props.onChangeText('Host-A'));
    await act(async () => {
      tree.root.findByProps({ testID: 'new-game-create-multiplayer-room' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => tree.root.findByProps({ testID: 'new-game-multiplayer-edit-rules' }).props.onPress());
    let controls = tree.root.findAllByType(SegmentedControl);
    await act(async () => controls.find((control) => control.props.value === 'TWO_FIVE_CHICKEN')?.props.onChange('FIVE_ONE'));
    expect(mockedUpdateOpenRoomRules).not.toHaveBeenCalled();
    await act(async () => {
      tree.root.findByProps({ testID: 'new-game-local-rules-done' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedUpdateOpenRoomRules).toHaveBeenCalledWith(expect.objectContaining({
      roomId: MULTIPLAYER_ROOM_ID,
      hostUid: 'host-1',
      rulesSnapshot: expect.objectContaining({ serializedRules: expect.any(String) }),
    }));
    expect(nativeText(tree)).toContain('傳統番數 · 五一 · 全銃');

    await act(async () => tree.unmount());
  });

  it('restores an existing hosted room directly into the post-room host setup', async () => {
    mockSyncPlayers = [
      {
        playerId: 'host-1', roomId: MULTIPLAYER_ROOM_ID, kind: 'member', uid: 'host-1', displayName: 'Host-A',
        avatarUrl: null, isHost: true, isSelf: true, joinedAt: 1,
      },
    ];
    mockedLoadActiveHostedRoomPointer.mockResolvedValue({ uid: 'host-1', roomId: MULTIPLAYER_ROOM_ID });
    mockedGetCurrentSession.mockResolvedValue({ uid: 'host-1', provider: 'google' });
    mockedRecoverHostedRoom.mockResolvedValue({ kind: 'open', room: multiplayerRoom, invite: multiplayerInvite });

    const { tree } = await renderScreen('multiplayer');
    expect(tree.root.findAllByProps({ testID: 'new-game-multiplayer-pre-room' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'new-game-multiplayer-host-setup' })).toBeTruthy();
    expect(nativeText(tree)).not.toContain(MULTIPLAYER_ROOM_ID);
    expect(nativeText(tree)).toContain('已加入 1 人');
    expect(nativeText(tree)).not.toContain('/ 8');
    expect(nativeText(tree)).toContain('房主：Host-A');
    expect(tree.root.findByProps({ testID: 'new-game-share-invite' })).toBeTruthy();
    expect(mockedCreateRoom).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });

  it('keeps Multiplayer Quick Setup copy complete across all supported locales', () => {
    const requiredKeys = [
      'newGame.multiplayer.preRoomTitle',
      'newGame.multiplayer.hostTitle',
      'newGame.multiplayer.create',
      'newGame.multiplayer.hostNameLabel',
      'newGame.multiplayer.preRoomHelper',
      'newGame.multiplayer.shareInvite',
      'newGame.multiplayer.joinedCount',
      'newGame.multiplayer.seatArrangement',
      'newGame.multiplayer.waiting',
      'newGame.multiplayer.addTemporary',
      'newGame.multiplayer.insufficientTitle',
      'newGame.multiplayer.insufficientMessage',
      'newGame.multiplayer.inviteFriends',
      'newGame.multiplayer.returnLocal',
    ] as const;

    for (const key of requiredKeys) {
      expect(en[key]).toBeTruthy();
      expect(zhHans[key]).toBeTruthy();
      expect(zhHant[key]).toBeTruthy();
    }
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
