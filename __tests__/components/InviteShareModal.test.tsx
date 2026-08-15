import React from 'react';
import renderer, { act } from 'react-test-renderer';
import InviteShareModal from '../../src/components/InviteShareModal';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? ReactLib.createElement(View, null, children) : null,
  };
});

const invite = {
  roomId: 'room_demo',
  token: 'token_demo',
  expiresAt: Date.now() + 60_000,
  deepLink: 'mahjongfan://join?roomId=room_demo&token=token_demo',
};

const labels = {
  title: '分享邀請',
  subtitle: '朋友可以用手機相機掃描呢個 QR Code，或者使用邀請連結加入。',
  inviteUrlLabel: '邀請連結',
  shareAction: '分享連結',
  close: '關閉',
  loading: '準備邀請中...',
};

describe('InviteShareModal', () => {
  it('renders the QR value and share controls without redundant labels', async () => {
    const onShare = jest.fn();
    const onClose = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <InviteShareModal
          visible
          roomTitle="同步房"
          invite={invite}
          busy={false}
          labels={labels}
          onShare={onShare}
          onClose={onClose}
        />,
      );
    });

    const qr = tree!.root.findAll((node) => String(node.type) === 'QRCode');
    expect(qr).toHaveLength(1);
    expect(qr[0].props.value).toBe(invite.deepLink);
    expect(JSON.stringify(tree!.toJSON())).toContain(invite.deepLink);

    expect(tree!.root.findAllByProps({ testID: 'invite-share-room-code' })).toHaveLength(0);

    act(() => {
      tree!.root.findByProps({ testID: 'invite-share-action' }).props.onPress();
      tree!.root.findByProps({ testID: 'invite-share-close' }).props.onPress();
    });

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render its contents while hidden', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <InviteShareModal
          visible={false}
          roomTitle="同步房"
          invite={invite}
          busy={false}
          labels={labels}
          onShare={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    expect(tree!.toJSON()).toBeNull();
  });
});
