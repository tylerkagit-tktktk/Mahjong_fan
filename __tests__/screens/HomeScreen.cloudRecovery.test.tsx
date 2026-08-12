import React from 'react';
import renderer, { act } from 'react-test-renderer';
import HomeScreen from '../../src/screens/HomeScreen';
import en from '../../src/i18n/locales/en.json';
import zhHans from '../../src/i18n/locales/zh-Hans.json';
import zhHant from '../../src/i18n/locales/zh-Hant.json';
import { ensureSession, getCurrentSession } from '../../src/services/cloud/authRepo';
import { getRoom } from '../../src/services/cloud/roomRepo';
import {
  clearActiveJoinedRoomPointer,
  loadActiveJoinedRoomPointer,
} from '../../src/services/cloud/storage';

jest.mock('../../src/db/repo', () => ({
  endGame: jest.fn(),
  listGames: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/cloud/authRepo', () => ({
  ensureSession: jest.fn(),
  getCurrentSession: jest.fn(),
}));

jest.mock('../../src/services/cloud/roomRepo', () => ({
  getRoom: jest.fn(),
}));

jest.mock('../../src/services/cloud/storage', () => ({
  clearActiveJoinedRoomPointer: jest.fn(),
  loadActiveJoinedRoomPointer: jest.fn(),
}));

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string) => key,
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

const mockedEnsureSession = ensureSession as jest.MockedFunction<typeof ensureSession>;
const mockedGetCurrentSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;
const mockedGetRoom = getRoom as jest.MockedFunction<typeof getRoom>;
const mockedLoadActiveJoinedRoomPointer = loadActiveJoinedRoomPointer as jest.MockedFunction<typeof loadActiveJoinedRoomPointer>;
const mockedClearActiveJoinedRoomPointer = clearActiveJoinedRoomPointer as jest.MockedFunction<typeof clearActiveJoinedRoomPointer>;

async function renderScreen() {
  const navigation = {
    navigate: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(false),
    goBack: jest.fn(),
  } as any;

  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<HomeScreen navigation={navigation} route={{ key: 'home', name: 'Home' } as any} />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  return { tree: tree!, navigation };
}

describe('HomeScreen joined-room recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadActiveJoinedRoomPointer.mockResolvedValue(null);
    mockedGetCurrentSession.mockResolvedValue({ uid: 'guest-1', provider: 'anonymous' });
    mockedEnsureSession.mockResolvedValue({ uid: 'guest-1', provider: 'anonymous' });
  });

  it('returns an open joined room to the lobby', async () => {
    const pointer = { uid: 'guest-1', roomId: 'room-open' };
    mockedLoadActiveJoinedRoomPointer.mockResolvedValue(pointer);
    mockedGetRoom.mockResolvedValue({ roomId: pointer.roomId, status: 'open' } as any);

    const { tree, navigation } = await renderScreen();

    expect(mockedGetRoom).toHaveBeenCalledWith(pointer.roomId);
    expect(navigation.replace).toHaveBeenCalledWith('RoomLobby', { roomId: pointer.roomId });
    expect(mockedClearActiveJoinedRoomPointer).not.toHaveBeenCalled();
    await act(async () => {
      tree.unmount();
    });
  });

  it('returns an active joined room to the multiplayer table', async () => {
    const pointer = { uid: 'guest-1', roomId: 'room-active' };
    mockedLoadActiveJoinedRoomPointer.mockResolvedValue(pointer);
    mockedGetRoom.mockResolvedValue({ roomId: pointer.roomId, status: 'active' } as any);

    const { tree, navigation } = await renderScreen();

    expect(navigation.replace).toHaveBeenCalledWith('MultiplayerGameTable', { roomId: pointer.roomId });
    await act(async () => {
      tree.unmount();
    });
  });

  it('clears a pointer when its room no longer exists', async () => {
    const pointer = { uid: 'guest-1', roomId: 'room-removed' };
    mockedLoadActiveJoinedRoomPointer.mockResolvedValue(pointer);
    mockedGetRoom.mockResolvedValue(null);

    const { tree, navigation } = await renderScreen();

    expect(mockedClearActiveJoinedRoomPointer).toHaveBeenCalledWith(pointer);
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => {
      tree.unmount();
    });
  });

  it('clears a pointer when a joined room is cancelling', async () => {
    const pointer = { uid: 'guest-1', roomId: 'room-cancelling' };
    mockedLoadActiveJoinedRoomPointer.mockResolvedValue(pointer);
    mockedGetRoom.mockResolvedValue({ roomId: pointer.roomId, status: 'cancelling' } as any);

    const { tree, navigation } = await renderScreen();

    expect(mockedClearActiveJoinedRoomPointer).toHaveBeenCalledWith(pointer);
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => {
      tree.unmount();
    });
  });

  it('exposes the local, multiplayer, invite, history, and settings entry points', async () => {
    const { tree, navigation } = await renderScreen();

    const localAction = tree.root.findByProps({ testID: 'home-start-local' });
    const multiplayerAction = tree.root.findByProps({ testID: 'home-create-multiplayer' });
    const joinAction = tree.root.findByProps({ testID: 'home-join-multiplayer' });
    const historyAction = tree.root.findByProps({ testID: 'home-history' });
    const settingsAction = tree.root.findByProps({ testID: 'home-settings' });

    expect(localAction.props.accessibilityRole).toBe('button');
    expect(localAction.props.accessibilityLabel).toContain('開始記分');
    expect(multiplayerAction.props.accessibilityRole).toBe('button');
    expect(multiplayerAction.props.accessibilityLabel).toContain('開多人枱');
    expect(joinAction.props.accessibilityRole).toBe('button');
    expect(joinAction.props.accessibilityLabel).toContain('加入牌局');
    expect(historyAction.props.accessibilityLabel).toBe('所有戰績');
    expect(zhHant['home.historyAllCantonese']).toBe('所有戰績');
    expect(zhHans['home.historyAllCantonese']).toBe('所有战绩');
    expect(en['home.historyAllCantonese']).toBe('All records');
    expect(zhHant['home.multiplayer']).toBe('多人牌局');
    expect(zhHans['home.multiplayer']).toBe('多人牌局');
    expect(en['home.multiplayer']).toBe('Multiplayer');

    await act(async () => {
      localAction.props.onPress();
      await Promise.resolve();
    });
    multiplayerAction.props.onPress();
    joinAction.props.onPress();
    historyAction.props.onPress();
    settingsAction.props.onPress();

    expect(navigation.navigate).toHaveBeenCalledWith('NewGameStepper');
    expect(navigation.navigate).toHaveBeenCalledWith('NewGameStepper', { entryMode: 'multiplayer' });
    expect(navigation.navigate).toHaveBeenCalledWith('JoinInvite', {});
    expect(navigation.navigate).toHaveBeenCalledWith('History');
    expect(navigation.navigate).toHaveBeenCalledWith('Settings');

    const renderedText = tree.root
      .findAllByType('Text' as any)
      .map((node) => node.children.join(''))
      .join(' ');
    expect(renderedText).not.toContain('最近戰績');
    expect(renderedText).not.toContain('小工具');

    await act(async () => {
      tree.unmount();
    });
  });
});
