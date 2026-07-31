import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import HostNameConfirmModal from '../../src/screens/newGameStepper/sections/HostNameConfirmModal';
import AppButton from '../../src/components/AppButton';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: { children: React.ReactNode }) => ReactLib.createElement(View, null, children) };
});

const labels = {
  title: '確認你的名稱', message: '確認後先建立', inputLabel: '房主名稱', placeholder: '輸入名稱',
  cancel: '取消', confirm: '確認建立', confirming: '建立中',
};

describe('HostNameConfirmModal', () => {
  it('does not submit an empty name and submits a valid prefilled name', async () => {
    const onConfirm = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <HostNameConfirmModal visible value="" busy={false} error={null} labels={labels} onChange={jest.fn()} onCancel={jest.fn()} onConfirm={onConfirm} />,
      );
    });
    const buttons = tree!.root.findAllByType(AppButton);
    expect(buttons.find((node) => node.props.label === labels.confirm)?.props.disabled).toBe(true);

    await act(async () => tree!.update(
      <HostNameConfirmModal visible value="阿東" busy={false} error={null} labels={labels} onChange={jest.fn()} onCancel={jest.fn()} onConfirm={onConfirm} />,
    ));
    const input = tree!.root.findByType(TextInput);
    await act(async () => input.props.onSubmitEditing());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels without invoking confirmation', async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <HostNameConfirmModal visible value="房主" busy={false} error={null} labels={labels} onChange={jest.fn()} onCancel={onCancel} onConfirm={onConfirm} />,
      );
    });
    const cancel = tree!.root.findAllByType(AppButton).find((node) => node.props.label === labels.cancel);
    await act(async () => cancel?.props.onPress());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
