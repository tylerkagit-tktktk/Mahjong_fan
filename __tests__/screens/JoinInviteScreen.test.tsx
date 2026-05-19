import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import JoinInviteScreen from '../../src/screens/cloud/JoinInviteScreen';
import { ensureSession } from '../../src/services/cloud/authRepo';
import { joinWithInvite } from '../../src/services/cloud/roomRepo';

jest.mock('../../src/services/cloud/authRepo', () => ({
  ensureSession: jest.fn(),
}));

jest.mock('../../src/services/cloud/roomRepo', () => ({
  joinWithInvite: jest.fn(),
}));

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string) => {
      const table: Record<string, string> = {
        'common.back': '返回',
        'joinInvite.kicker': '房間邀請',
        'joinInvite.loadingTitle': '處理邀請中',
        'joinInvite.loadingBody': '正在檢查房間代碼同邀請資料。',
        'joinInvite.missingTitle': '邀請連結不完整',
        'joinInvite.missingBody': '此邀請缺少房間代碼或驗證資料，請房主重新產生邀請。',
        'joinInvite.localOnlyTitle': '暫未支援跨機加入',
        'joinInvite.localOnlyBody': '目前同步房間仍儲存在房主本機。',
        'roomLobby.hostTools.roomCode': '房間代碼',
      };
      return table[key] ?? key;
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

const mockedEnsureSession = ensureSession as jest.MockedFunction<typeof ensureSession>;
const mockedJoinWithInvite = joinWithInvite as jest.MockedFunction<typeof joinWithInvite>;

function textContent(root: renderer.ReactTestInstance): string {
  return root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join('') : String(children);
    })
    .join('\n');
}

async function renderScreen(params?: { roomId?: string; token?: string }) {
  const navigation = {
    navigate: jest.fn(),
    replace: jest.fn(),
  } as any;

  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <JoinInviteScreen
        navigation={navigation}
        route={{ key: 'join', name: 'JoinInvite', params } as any}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  return { tree: tree!, navigation };
}

describe('JoinInviteScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnsureSession.mockResolvedValue({ uid: 'uid-1', provider: 'google' });
  });

  it('shows missing params when the invite URL is incomplete', async () => {
    const { tree } = await renderScreen({ roomId: 'room-1' });
    const text = textContent(tree.root);

    expect(text).toContain('邀請連結不完整');
    expect(mockedEnsureSession).not.toHaveBeenCalled();
    expect(mockedJoinWithInvite).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('explains local-only limitation when the room is not in this device snapshot', async () => {
    mockedJoinWithInvite.mockResolvedValueOnce({
      ok: false,
      code: 'INVITE_EXPIRED',
      message: 'Room not found',
    });

    const { tree } = await renderScreen({ roomId: 'room-1', token: 'token-1' });
    const text = textContent(tree.root);

    expect(mockedJoinWithInvite).toHaveBeenCalledWith('room-1', 'token-1', 'uid-1');
    expect(text).toContain('暫未支援跨機加入');
    expect(text).toContain('房間代碼：room-1');

    await act(async () => {
      tree.unmount();
    });
  });

  it('navigates to room lobby when joining succeeds on the same device', async () => {
    mockedJoinWithInvite.mockResolvedValueOnce({ ok: true, nextVersion: 2, nextHandIndex: 0 });

    const { tree, navigation } = await renderScreen({ roomId: 'room-1', token: 'token-1' });

    expect(navigation.replace).toHaveBeenCalledWith('RoomLobby', { roomId: 'room-1' });

    await act(async () => {
      tree.unmount();
    });
  });
});
