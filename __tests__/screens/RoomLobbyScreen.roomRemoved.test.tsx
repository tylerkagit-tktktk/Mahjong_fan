import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import RoomLobbyScreen from '../../src/screens/cloud/RoomLobbyScreen';
import { ensureSession } from '../../src/services/cloud/authRepo';
import { subscribeRoomState } from '../../src/services/cloud/roomRepo';

jest.mock('../../src/services/cloud/authRepo', () => ({
  ensureSession: jest.fn(),
}));

jest.mock('../../src/services/cloud/roomRepo', () => ({
  addTemporaryPlayer: jest.fn(),
  addTemporaryPlayers: jest.fn(),
  createInvite: jest.fn(),
  deleteRoomAndFallbackToLocal: jest.fn(),
  getBenchPlayers: jest.fn(() => []),
  getDefaultStartSeats: jest.fn(() => null),
  listRoomPlayers: jest.fn(),
  mergeTemporaryPlayerIntoRealPlayer: jest.fn(),
  proposeLineupChange: jest.fn(),
  startRoom: jest.fn(),
  subscribeRoomState: jest.fn(),
}));

jest.mock('../../src/i18n/useAppLanguage', () => {
  const translations: Record<string, string> = {
    'common.ok': '確定',
    'roomLobby.alert.roomRemovedTitle': '同步房已關閉',
    'roomLobby.alert.roomRemovedMessage': '房主已刪除此同步房，將返回上一頁。',
  };
  const t = (key: string) => translations[key] ?? key;
  return {
    useAppLanguage: () => ({ t, language: 'zh-Hant' }),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactLib.createElement(View, null, children),
  };
});

const mockedEnsureSession = ensureSession as jest.MockedFunction<typeof ensureSession>;
const mockedSubscribeRoomState = subscribeRoomState as jest.MockedFunction<typeof subscribeRoomState>;

describe('RoomLobbyScreen deleted room handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnsureSession.mockResolvedValue({ uid: 'guest-1', provider: 'google' });
  });

  async function renderRemovedRoom(canGoBack: boolean) {
    let publishRoomState: Parameters<typeof subscribeRoomState>[2] = () => {};
    mockedSubscribeRoomState.mockImplementation((_roomId, _sessionUid, cb) => {
      publishRoomState = cb;
      return jest.fn();
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const navigation = {
      canGoBack: jest.fn(() => canGoBack),
      goBack: jest.fn(),
      replace: jest.fn(),
    } as any;

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <RoomLobbyScreen
          navigation={navigation}
          route={{ key: 'room-lobby', name: 'RoomLobby', params: { roomId: 'room-1' } } as any}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      publishRoomState({
        room: {
          roomId: 'room-1',
          title: 'Room 1',
          hostUid: 'host-1',
          status: 'open',
          memberCap: 8,
          activeLineupVersion: 0,
        } as any,
        players: [],
        lineup: null,
      });
    });
    expect(alertSpy).not.toHaveBeenCalled();

    act(() => {
      publishRoomState({ room: null, players: [], lineup: null });
    });

    return { alertSpy, navigation, publishRoomState, tree: tree! };
  }

  it('alerts once and returns after a previously loaded room is deleted', async () => {
    const { alertSpy, navigation, publishRoomState, tree } = await renderRemovedRoom(true);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      '同步房已關閉',
      '房主已刪除此同步房，將返回上一頁。',
      [expect.objectContaining({ text: '確定', onPress: expect.any(Function) })],
      { cancelable: false },
    );

    const buttons = alertSpy.mock.calls[0][2];
    act(() => {
      buttons?.[0]?.onPress?.();
      publishRoomState({ room: null, players: [], lineup: null });
    });

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.unmount();
    });
    alertSpy.mockRestore();
  });

  it('replaces the deleted room with Home when opened as the deep-link root', async () => {
    const { alertSpy, navigation, tree } = await renderRemovedRoom(false);
    const buttons = alertSpy.mock.calls[0][2];

    act(() => {
      buttons?.[0]?.onPress?.();
    });

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('Home');

    await act(async () => {
      tree.unmount();
    });
    alertSpy.mockRestore();
  });
});
