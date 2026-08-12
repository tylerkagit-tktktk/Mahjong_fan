import React from 'react';
import { TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import JoinLandingScreen from '../../src/screens/cloud/JoinLandingScreen';
import { ensureSession } from '../../src/services/cloud/authRepo';
import { joinWithInvite } from '../../src/services/cloud/roomRepo';

jest.mock('../../src/services/cloud/authRepo', () => ({ ensureSession: jest.fn() }));
jest.mock('../../src/services/cloud/roomRepo', () => ({ joinWithInvite: jest.fn() }));

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string) => ({
      'joinLanding.action': '加入牌局',
      'joinLanding.body': '將完整邀請連結貼喺下面，就可以加入多人牌局。',
      'joinLanding.footer': '朋友亦可以直接將邀請連結傳俾你，撳開連結後會自動進入牌局。',
      'joinLanding.formatError': '邀請連結格式不正確',
      'joinLanding.inputHint': '請貼上朋友分享嘅完整邀請連結。',
      'joinLanding.inputLabel': '邀請連結',
      'joinLanding.placeholder': '貼上完整邀請連結',
      'joinLanding.required': '請貼上邀請連結',
      'joinLanding.title': '收到朋友嘅邀請？',
    }[key] ?? key),
  }),
}));

jest.mock('../../src/settings/useAppPreferences', () => ({
  useAppPreferences: () => ({ textScale: 1 }),
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

function renderScreen() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <JoinLandingScreen
        navigation={navigation}
        route={{ key: 'join-landing', name: 'JoinLanding' } as any}
      />,
    );
  });
  return { tree: tree!, navigation };
}

describe('JoinLandingScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders an accessible full-link input without starting Cloud join work', () => {
    const { tree } = renderScreen();
    const input = tree.root.findByProps({ testID: 'join-landing-invite-link' });

    expect(input.props.accessibilityLabel).toBe('邀請連結');
    expect(input.props.accessibilityHint).toBe('請貼上朋友分享嘅完整邀請連結。');
    expect(input.props.placeholder).toBe('貼上完整邀請連結');
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
    expect(tree.root.findByProps({ testID: 'join-landing-submit' }).props.accessibilityLabel).toBe('加入牌局');
    expect(mockedEnsureSession).not.toHaveBeenCalled();
    expect(mockedJoinWithInvite).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  it('keeps empty and malformed input on the landing with an inline error', () => {
    const { tree, navigation } = renderScreen();

    act(() => tree.root.findByProps({ testID: 'join-landing-submit' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'join-landing-error' }).props.children).toBe('請貼上邀請連結');
    expect(navigation.navigate).not.toHaveBeenCalled();

    act(() => tree.root.findByType(TextInput).props.onChangeText('mahjongfan://join?roomId=room_demo'));
    expect(tree.root.findAllByProps({ testID: 'join-landing-error' })).toHaveLength(0);
    act(() => tree.root.findByProps({ testID: 'join-landing-submit' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'join-landing-error' }).props.children).toBe('邀請連結格式不正確');
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(mockedEnsureSession).not.toHaveBeenCalled();
    expect(mockedJoinWithInvite).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  it('navigates a structurally valid link into the existing JoinInvite flow', () => {
    const { tree, navigation } = renderScreen();
    const link = 'mahjongfan://join?roomId=room_demo&token=token_demo';

    act(() => tree.root.findByType(TextInput).props.onChangeText(link));
    expect(mockedEnsureSession).not.toHaveBeenCalled();
    expect(mockedJoinWithInvite).not.toHaveBeenCalled();
    act(() => tree.root.findByProps({ testID: 'join-landing-submit' }).props.onPress());

    expect(navigation.navigate).toHaveBeenCalledWith('JoinInvite', {
      roomId: 'room_demo',
      token: 'token_demo',
    });
    expect(mockedEnsureSession).not.toHaveBeenCalled();
    expect(mockedJoinWithInvite).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });
});
