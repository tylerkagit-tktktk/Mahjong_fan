import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, Text } from 'react-native';
import AppButton from '../../src/components/AppButton';
import MultiplayerGameTableScreen from '../../src/screens/cloud/MultiplayerGameTableScreen';
import { archiveRoomToLocal } from '../../src/services/cloud/archiveRepo';
import { ensureSession } from '../../src/services/cloud/authRepo';
import { listHands, submitHand } from '../../src/services/cloud/handRepo';
import {
  endRoom,
  getRoom,
  listLineups,
  subscribeRoomState,
} from '../../src/services/cloud/roomRepo';

jest.mock('../../src/services/cloud/archiveRepo', () => ({
  archiveRoomToLocal: jest.fn(),
}));

jest.mock('../../src/services/cloud/authRepo', () => ({
  ensureSession: jest.fn(),
}));

jest.mock('../../src/services/cloud/handRepo', () => ({
  listHands: jest.fn(),
  submitHand: jest.fn(),
}));

jest.mock('../../src/services/cloud/roomRepo', () => ({
  endRoom: jest.fn(),
  getRoom: jest.fn(),
  listLineups: jest.fn(),
  subscribeRoomState: jest.fn(),
}));

jest.mock('../../src/i18n/useAppLanguage', () => ({
  useAppLanguage: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const table: Record<string, string> = {
        'gameTable.handCount.started': '已打 {count} 鋪',
        'gameTable.handCount.notStarted': '未開局',
        'gameTable.roundSummary': '第 {round} 圈 · {status}',
      };
      const base = table[key] ?? key;
      if (!values) {
        return base;
      }
      return Object.entries(values).reduce(
        (result, [token, value]) => result.replace(`{${token}}`, String(value)),
        base,
      );
    },
    language: 'zh-Hant',
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactLib.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const mockedArchiveRoomToLocal = archiveRoomToLocal as jest.MockedFunction<typeof archiveRoomToLocal>;
const mockedEnsureSession = ensureSession as jest.MockedFunction<typeof ensureSession>;
const mockedListHands = listHands as jest.MockedFunction<typeof listHands>;
const mockedSubmitHand = submitHand as jest.MockedFunction<typeof submitHand>;
const mockedEndRoom = endRoom as jest.MockedFunction<typeof endRoom>;
const mockedGetRoom = getRoom as jest.MockedFunction<typeof getRoom>;
const mockedListLineups = listLineups as jest.MockedFunction<typeof listLineups>;
const mockedSubscribeRoomState = subscribeRoomState as jest.MockedFunction<typeof subscribeRoomState>;

function createRoom() {
  return {
    roomId: 'room-1',
    title: 'Room 1',
    hostUid: 'uid-1',
    status: 'active',
    maxSeats: 4,
    memberCap: 8,
    memberCount: 4,
    currentVersion: 2,
    currentHandIndex: 1,
    activeLineupVersion: 1,
    rulesSnapshot: {
      serializedRules: JSON.stringify({
        version: 1,
        variant: 'HK',
        mode: 'HK',
        currencyCode: 'HKD',
        currencySymbol: 'HK$',
        minFanToWin: 3,
        hk: {
          scoringPreset: 'traditionalFan',
          gunMode: 'fullGun',
          stakePreset: 'TWO_FIVE_CHICKEN',
          capFan: 10,
          unitPerFan: 1,
        },
      }),
    },
    archiveReadyAt: null,
    expiresAt: null,
    archiveVersion: null,
    createdAt: 1735689600000,
    updatedAt: 1735689600000,
  } as any;
}

function createLineup() {
  return {
    lineupId: 'lineup-1',
    roomId: 'room-1',
    effectiveFromHandIndex: 0,
    seats: {
      '0': 'uid-1',
      '1': 'uid-2',
      '2': 'uid-3',
      '3': 'uid-4',
    },
    createdByUid: 'uid-1',
    createdAt: 1735689600000,
    baseVersion: 1,
    lineupVersion: 1,
  } as any;
}

function createPlayers() {
  return ['uid-1', 'uid-2', 'uid-3', 'uid-4'].map((uid, index) => ({
    playerId: uid,
    roomId: 'room-1',
    kind: 'member',
    uid,
    displayName: `P${index + 1}`,
    avatarUrl: null,
    isHost: index === 0,
    isSelf: index === 0,
    joinedAt: 1735689600000 + index,
  })) as any;
}

async function renderScreen(navigation = {
  setOptions: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
} as any) {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <MultiplayerGameTableScreen
        navigation={navigation}
        route={{ key: 'k1', name: 'MultiplayerGameTable', params: { roomId: 'room-1' } } as any}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return { tree: tree!, navigation };
}

function textNodes(root: renderer.ReactTestInstance): string[] {
  return root.findAllByType(Text).map((node) => {
    const children = node.props.children;
    return Array.isArray(children) ? children.join('') : String(children);
  });
}

describe('MultiplayerGameTableScreen end game flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnsureSession.mockResolvedValue({ uid: 'uid-1', provider: 'google' });
    mockedGetRoom.mockResolvedValue(createRoom());
    mockedListHands.mockResolvedValue([]);
    mockedSubmitHand.mockResolvedValue({ ok: true, nextVersion: 3, nextHandIndex: 2 });
    mockedListLineups.mockResolvedValue([createLineup()]);
    mockedEndRoom.mockResolvedValue({ ok: true, nextVersion: 3, nextHandIndex: 1 });
    mockedArchiveRoomToLocal.mockResolvedValue({
      roomId: 'room-1',
      title: 'Room 1',
      createdAt: 1735689600000,
      endedAt: 1735693200000,
      archivedFromCloudAt: 1735693200000,
      expiresAt: null,
      archiveVersion: 1,
      memberCount: 4,
      handCount: 1,
    });
    mockedSubscribeRoomState.mockImplementation((_roomId, _uid, cb) => {
      cb({ room: createRoom(), players: createPlayers(), lineup: createLineup() });
      return jest.fn();
    });
  });

  it('confirms, archives locally, and replaces to cloud archive detail', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { tree, navigation } = await renderScreen();

    const endButton = tree.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === 'gameTable.action.endGame');
    expect(endButton).toBeTruthy();

    await act(async () => {
      endButton!.props.onPress();
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const confirmButton = (buttons as Array<{ text: string; onPress?: () => void | Promise<void> }>).find(
      (button) => button.text === 'gameTable.endGame.confirm',
    );

    await act(async () => {
      await confirmButton!.onPress?.();
    });

    expect(mockedEndRoom).toHaveBeenCalledWith('room-1', 'uid-1');
    expect(mockedArchiveRoomToLocal).toHaveBeenCalledWith('room-1', 'uid-1');
    expect(navigation.replace).toHaveBeenCalledWith('CloudArchiveDetail', { roomId: 'room-1' });

    alertSpy.mockRestore();
    await act(async () => {
      tree.unmount();
    });
  });

  it('archives and opens the summary when another player ends the room', async () => {
    let emitRoom: ((room: ReturnType<typeof createRoom>) => void) | null = null;
    mockedSubscribeRoomState.mockImplementation((_roomId, _uid, cb) => {
      emitRoom = (room) => cb({ room, players: createPlayers(), lineup: createLineup() });
      cb({ room: createRoom(), players: createPlayers(), lineup: createLineup() });
      return jest.fn();
    });
    const { tree, navigation } = await renderScreen();

    await act(async () => {
      emitRoom?.({ ...createRoom(), status: 'ended' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedArchiveRoomToLocal).toHaveBeenCalledWith('room-1', 'uid-1');
    expect(navigation.replace).toHaveBeenCalledWith('CloudArchiveDetail', { roomId: 'room-1' });

    await act(async () => {
      tree.unmount();
    });
  });

  it('prevents duplicate end submits while ending is in-flight', async () => {
    let resolveEndRoom: (() => void) | null = null;
    mockedEndRoom.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEndRoom = () => resolve({ ok: true, nextVersion: 3, nextHandIndex: 1 });
        }),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { tree } = await renderScreen();

    const endButton = tree.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === 'gameTable.action.endGame');

    await act(async () => {
      endButton!.props.onPress();
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const confirmButton = (buttons as Array<{ text: string; onPress?: () => void | Promise<void> }>).find(
      (button) => button.text === 'gameTable.endGame.confirm',
    );

    await act(async () => {
      confirmButton!.onPress?.();
      confirmButton!.onPress?.();
    });

    expect(mockedEndRoom).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveEndRoom?.();
      await Promise.resolve();
    });

    alertSpy.mockRestore();
    await act(async () => {
      tree.unmount();
    });
  });

  it('submits draw pass with dealerAction so dealer can advance', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { tree } = await renderScreen();

    const drawButton = tree.root
      .findAllByType(AppButton)
      .find((button) => button.props.label === 'gameTable.action.draw');
    expect(drawButton).toBeTruthy();

    await act(async () => {
      drawButton!.props.onPress();
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const passButton = (buttons as Array<{ text: string; onPress?: () => void | Promise<void> }>).find(
      (button) => button.text === 'gameTable.draw.pass',
    );

    await act(async () => {
      await passButton!.onPress?.();
    });

    expect(mockedSubmitHand).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'room-1',
        submittedByUid: 'uid-1',
        type: 'draw',
        dealerAction: 'pass',
      }),
    );

    alertSpy.mockRestore();
    await act(async () => {
      tree.unmount();
    });
  });

  it('shows the next dealer after a non-dealer win', async () => {
    mockedListHands.mockResolvedValue([
      {
        handId: 'hand-1',
        roomId: 'room-1',
        handIndex: 1,
        type: 'discard',
        submittedByUid: 'uid-1',
        baseVersion: 2,
        serverVersion: 3,
        lineupVersion: 1,
        winnerPlayerId: 'uid-2',
        discarderPlayerId: 'uid-1',
        fan: 3,
        createdAt: 1735689600000,
      },
    ] as any);

    const { tree } = await renderScreen();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const labels = textNodes(tree.root);

    const centerDealerIndex = labels.findIndex((value, index) =>
      value === 'gameTable.currentDealer' && labels[index + 1] === '南',
    );

    expect(centerDealerIndex).toBeGreaterThanOrEqual(0);
    expect(labels).toContain('東風南局');
    expect(labels).toContain('第 1 圈 · 已打 1 鋪');

    await act(async () => {
      tree.unmount();
    });
  });

  it('advances to the next wind after four dealer passes', async () => {
    mockedListHands.mockResolvedValue([
      {
        handId: 'hand-1',
        roomId: 'room-1',
        handIndex: 1,
        type: 'discard',
        submittedByUid: 'uid-1',
        baseVersion: 2,
        serverVersion: 3,
        lineupVersion: 1,
        winnerPlayerId: 'uid-2',
        discarderPlayerId: 'uid-1',
        fan: 3,
        createdAt: 1735689600000,
      },
      {
        handId: 'hand-2',
        roomId: 'room-1',
        handIndex: 2,
        type: 'discard',
        submittedByUid: 'uid-2',
        baseVersion: 3,
        serverVersion: 4,
        lineupVersion: 1,
        winnerPlayerId: 'uid-3',
        discarderPlayerId: 'uid-2',
        fan: 3,
        createdAt: 1735689600001,
      },
      {
        handId: 'hand-3',
        roomId: 'room-1',
        handIndex: 3,
        type: 'discard',
        submittedByUid: 'uid-3',
        baseVersion: 4,
        serverVersion: 5,
        lineupVersion: 1,
        winnerPlayerId: 'uid-4',
        discarderPlayerId: 'uid-3',
        fan: 3,
        createdAt: 1735689600002,
      },
      {
        handId: 'hand-4',
        roomId: 'room-1',
        handIndex: 4,
        type: 'discard',
        submittedByUid: 'uid-4',
        baseVersion: 5,
        serverVersion: 6,
        lineupVersion: 1,
        winnerPlayerId: 'uid-1',
        discarderPlayerId: 'uid-4',
        fan: 3,
        createdAt: 1735689600003,
      },
    ] as any);

    const { tree } = await renderScreen();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const labels = textNodes(tree.root);
    expect(labels).toContain('南風東局');
    expect(labels).toContain('第 2 圈 · 已打 4 鋪');

    await act(async () => {
      tree.unmount();
    });
  });
});
