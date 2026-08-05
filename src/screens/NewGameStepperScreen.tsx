import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AppText from '../components/AppText';
import InviteShareModal from '../components/InviteShareModal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomActionBar from '../components/BottomActionBar';
import ScreenContainer from '../components/ScreenContainer';
import TraditionalHkPaytableModal from '../components/TraditionalHkPaytableModal';
import { createGameWithPlayers } from '../db/repo';
import { DEBUG_FLAGS } from '../debug/debugFlags';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { translateWithFallback } from '../i18n/translateWithFallback';
import { DEFAULT_CURRENCY_CODE, CurrencyCode, formatCurrencyUnit, getCurrencyMeta } from '../models/currency';
import { useAppPreferences } from '../settings/useAppPreferences';
import { getDefaultRules, HkGunMode, HkScoringPreset, HkStakePreset, parseRules, RulesV1, serializeRules } from '../models/rules';
import { ResolvedRoomPlayer, Room, SeatKey } from '../models/cloud';
import { RootStackParamList } from '../navigation/types';
import { ensureSession, getCurrentSession } from '../services/cloud/authRepo';
import {
  addTemporaryPlayers,
  createRoom,
  deleteRoomAndFallbackToLocal,
  getOrCreateActiveInvite,
  getRoom,
  recoverHostedRoom,
  startRoom,
  subscribeRoomPlayers,
} from '../services/cloud/roomRepo';
import type { InvitePayload } from '../services/cloud/roomRepo';
import { buildInviteShareMessage } from '../services/cloud/inviteShare';
import { getProfile, normalizeDisplayName, updateProfile } from '../services/cloud/profileRepo';
import {
  clearActiveHostedRoomPointer,
  clearPendingHostedRoomCleanup,
  loadActiveHostedRoomDraft,
  loadActiveHostedRoomPointer,
  loadPendingHostedRoomCleanup,
  saveActiveHostedRoomDraft,
} from '../services/cloud/storage';
import theme from '../theme/theme';
import { typography } from '../styles/typography';
import {
  CAP_FAN_MAX,
  CAP_FAN_MIN,
  GRID,
  MIN_FAN_MAX,
  MIN_FAN_MIN,
  PLAYER_COUNT,
  SAMPLE_FAN_MAX,
  SAMPLE_FAN_MIN,
  UNIT_PER_FAN_MAX,
  UNIT_PER_FAN_MIN,
} from './newGameStepper/constants';
import {
  clamp,
  getDecimalRangeError,
  getMinFanError,
  getStakePresetHintLines,
  makeId,
  parseDecimalWithinRange,
  parseMinFan,
  rotatePlayersToEast,
} from './newGameStepper/helpers';
import CreateConfirmModal from './newGameStepper/sections/CreateConfirmModal';
import HostNameConfirmModal from './newGameStepper/sections/HostNameConfirmModal';
import CurrencySection from './newGameStepper/sections/CurrencySection';
import GameTitleSection from './newGameStepper/sections/GameTitleSection';
import PlayersSection from './newGameStepper/sections/PlayersSection';
import ScoringSection from './newGameStepper/sections/ScoringSection';
import { CapMode, ConfirmField, ConfirmSections, InvalidTarget, PreparedCreateContext, SeatMode, StartingDealerMode } from './newGameStepper/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewGameStepper'>;
const MAX_PLAYER_NAME_LENGTH = 10;
const SEAT_KEYS: SeatKey[] = ['0', '1', '2', '3'];
const EMPTY_SYNC_ASSIGNMENTS: Record<SeatKey, string | null> = { '0': null, '1': null, '2': null, '3': null };
const DEBUG_SYNC_PLAYER_NAMES = ['測試玩家 A', '測試玩家 B', '測試玩家 C', '測試玩家 D'];

function buildSeatAssignmentsFromPlayerIds(playerIds: Array<string | null> | null): Record<SeatKey, string | null> {
  if (!playerIds) {
    return EMPTY_SYNC_ASSIGNMENTS;
  }
  return {
    '0': playerIds[0] ?? null,
    '1': playerIds[1] ?? null,
    '2': playerIds[2] ?? null,
    '3': playerIds[3] ?? null,
  };
}

function rotateArray<T>(values: T[], eastIndex: number): T[] {
  if (values.length === 0) {
    return values;
  }
  const offset = ((eastIndex % values.length) + values.length) % values.length;
  return values.slice(offset).concat(values.slice(0, offset));
}

function shuffleArray<T>(values: T[]): T[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function NewGameStepperScreen({ navigation, route }: Props) {
  const { t, language } = useAppLanguage();
  const { defaultCurrencyCode } = useAppPreferences();
  const insets = useSafeAreaInsets();
  const prefill = route.params?.prefill;
  const currencyManuallyChangedRef = useRef(false);

  const [title, setTitle] = useState(prefill?.title ?? '');
  const [seatMode, setSeatMode] = useState<SeatMode>('manual');
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(prefill?.currencyCode ?? DEFAULT_CURRENCY_CODE);
  const [hkScoringPreset, setHkScoringPreset] = useState<HkScoringPreset>('traditionalFan');
  const [hkGunMode, setHkGunMode] = useState<HkGunMode>('fullGun');
  const [hkStakePreset, setHkStakePreset] = useState<HkStakePreset>('TWO_FIVE_CHICKEN');
  const [unitPerFan, setUnitPerFan] = useState(1);
  const [unitPerFanInput, setUnitPerFanInput] = useState('1');
  const [unitPerFanTouched, setUnitPerFanTouched] = useState(false);
  const [minFanToWin, setMinFanToWin] = useState(3);
  const [minFanInput, setMinFanInput] = useState('3');
  const [minFanTouched, setMinFanTouched] = useState(false);
  const [capFan, setCapFan] = useState<8 | 10 | 13>(10);
  const [customCapMode, setCustomCapMode] = useState<CapMode>('fanCap');
  const [customCapFan, setCustomCapFan] = useState(10);
  const [customCapFanInput, setCustomCapFanInput] = useState('10');
  const [customCapFanTouched, setCustomCapFanTouched] = useState(false);
  const [sampleFan, setSampleFan] = useState(3);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [players, setPlayers] = useState(['', '', '', '']);
  const [autoNames, setAutoNames] = useState(['', '', '', '']);
  const [autoAssigned, setAutoAssigned] = useState<string[] | null>(null);
  const [autoAssignedPlayerIds, setAutoAssignedPlayerIds] = useState<Array<string | null> | null>(null);
  const [startingDealerMode, setStartingDealerMode] = useState<StartingDealerMode>('random');
  const [startingDealerSourceIndex, setStartingDealerSourceIndex] = useState<number | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [stakePaytableVisible, setStakePaytableVisible] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<PreparedCreateContext | null>(null);
  const [sessionUid, setSessionUid] = useState('');
  const [draftRoom, setDraftRoom] = useState<Room | null>(null);
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [inviteShareVisible, setInviteShareVisible] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [syncPlayers, setSyncPlayers] = useState<ResolvedRoomPlayer[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [selectedSyncPlayerId, setSelectedSyncPlayerId] = useState('');
  const [syncSeatAssignments, setSyncSeatAssignments] = useState<Record<SeatKey, string | null>>(EMPTY_SYNC_ASSIGNMENTS);
  const [debugSyncJoinCount, setDebugSyncJoinCount] = useState(0);
  const [hostNameVisible, setHostNameVisible] = useState(false);
  const [hostDisplayName, setHostDisplayName] = useState('');
  const [hostNameError, setHostNameError] = useState<string | null>(null);
  const [pendingSyncContext, setPendingSyncContext] = useState<{ trimmedTitle: string; rules: RulesV1 } | null>(null);
  const [syncRetryAt, setSyncRetryAt] = useState<number | null>(null);
  const [pendingCleanupRoomId, setPendingCleanupRoomId] = useState<string | null>(null);
  const [cooldownNow, setCooldownNow] = useState(Date.now());
  const recoveryStartedRef = useRef(false);

  useEffect(() => {
    if (!prefill && !currencyManuallyChangedRef.current) {
      setCurrencyCode(defaultCurrencyCode);
    }
  }, [defaultCurrencyCode, prefill]);

  useEffect(() => {
    if (!prefill) {
      return;
    }

    setTitle(prefill.title ?? '');
    if (prefill.currencyCode) {
      setCurrencyCode(prefill.currencyCode);
    }

    if (!prefill.serializedRules) {
      return;
    }

    const parsedRules = parseRules(prefill.serializedRules, 'HK');
    setCurrencyCode(parsedRules.currencyCode);
    setHkScoringPreset(parsedRules.hk?.scoringPreset ?? 'traditionalFan');
    setHkGunMode(parsedRules.hk?.gunMode ?? 'fullGun');
    setHkStakePreset(parsedRules.hk?.stakePreset ?? 'TWO_FIVE_CHICKEN');
    setUnitPerFan(parsedRules.hk?.unitPerFan ?? 1);
    setUnitPerFanInput(String(parsedRules.hk?.unitPerFan ?? 1));
    setMinFanToWin(parsedRules.minFanToWin ?? 3);
    setMinFanInput(String(parsedRules.minFanToWin ?? 3));

    if (parsedRules.hk?.capFan == null) {
      setCustomCapMode('none');
      setCustomCapFan(10);
      setCustomCapFanInput('10');
      setCapFan(10);
      return;
    }

    if (parsedRules.hk?.scoringPreset === 'traditionalFan' && (parsedRules.hk.capFan === 8 || parsedRules.hk.capFan === 10 || parsedRules.hk.capFan === 13)) {
      setCapFan(parsedRules.hk.capFan);
      setCustomCapMode('fanCap');
      setCustomCapFan(parsedRules.hk.capFan);
      setCustomCapFanInput(String(parsedRules.hk.capFan));
      return;
    }

    setCustomCapMode('fanCap');
    setCustomCapFan(parsedRules.hk.capFan);
    setCustomCapFanInput(String(parsedRules.hk.capFan));
  }, [prefill]);

  useEffect(() => {
    if (!draftRoom?.roomId || !sessionUid) {
      setSyncPlayers([]);
      return;
    }

    return subscribeRoomPlayers(draftRoom.roomId, sessionUid, (nextPlayers) => {
      setSyncPlayers(nextPlayers.filter((player) => player.kind === 'member'));
    });
  }, [draftRoom?.roomId, sessionUid]);

  useEffect(() => {
    if (!selectedSyncPlayerId) {
      return;
    }
    if (syncPlayers.some((player) => player.playerId === selectedSyncPlayerId)) {
      return;
    }
    setSelectedSyncPlayerId('');
  }, [selectedSyncPlayerId, syncPlayers]);

  useEffect(() => {
    if (syncRetryAt === null) return;
    const tick = () => {
      const current = Date.now();
      setCooldownNow(current);
      if (current >= syncRetryAt) setSyncRetryAt(null);
    };
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [syncRetryAt]);

  useEffect(() => {
    if (!draftRoom) return;
    saveActiveHostedRoomDraft({
      roomId: draftRoom.roomId,
      seatMode,
      players,
      autoNames,
      autoAssigned,
      autoAssignedPlayerIds,
      startingDealerMode,
      startingDealerSourceIndex,
      syncSeatAssignments,
    }).catch(() => {});
  }, [autoAssigned, autoAssignedPlayerIds, autoNames, draftRoom, players, seatMode, startingDealerMode, startingDealerSourceIndex, syncSeatAssignments]);

  const scrollRef = useRef<ScrollView | null>(null);
  const titleInputRef = useRef<TextInput | null>(null);
  const manualPlayerRefs = useRef<Array<TextInput | null>>([]);
  const autoPlayerRefs = useRef<Array<TextInput | null>>([]);
  const minFanInputRef = useRef<TextInput | null>(null);
  const unitPerFanInputRef = useRef<TextInput | null>(null);
  const customCapFanInputRef = useRef<TextInput | null>(null);
  const sectionY = useRef<{ title: number; scoring: number; players: number; playersError: number }>({
    title: 0,
    scoring: 0,
    players: 0,
    playersError: 0,
  });

  const seatLabels = useMemo(() => [t('seat.east'), t('seat.south'), t('seat.west'), t('seat.north')], [t]);
  const hasDraftRoom = Boolean(draftRoom);
  const setupLocked = hasDraftRoom;
  const minFanLowerBound = hkScoringPreset === 'customTable' ? 1 : MIN_FAN_MIN;
  const parsedMinFanInput = parseMinFan(minFanInput, minFanLowerBound, MIN_FAN_MAX);
  const parsedCustomCapFan = parseMinFan(customCapFanInput, CAP_FAN_MIN, CAP_FAN_MAX);
  const customCapFanForCalc = customCapMode === 'fanCap' ? parsedCustomCapFan ?? customCapFan : null;
  const minFanCapRelationInvalid =
    parsedMinFanInput !== null &&
    (hkScoringPreset === 'traditionalFan' ? parsedMinFanInput > capFan : customCapFanForCalc !== null && parsedMinFanInput > customCapFanForCalc);

  const minFanError =
    (minFanTouched || submitAttempted)
      ? getMinFanError(minFanInput, minFanLowerBound, MIN_FAN_MAX, t('newGame.minFanValidation')) ??
        (minFanCapRelationInvalid ? t('newGame.minFanMustNotExceedCap') : null)
      : null;
  const unitPerFanError =
    hkScoringPreset === 'customTable' && (unitPerFanTouched || submitAttempted)
      ? getDecimalRangeError(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX, t('newGame.unitPerFanValidation'))
      : null;
  const customCapFanError =
    hkScoringPreset === 'customTable' && customCapMode === 'fanCap' && (customCapFanTouched || submitAttempted)
      ? getMinFanError(customCapFanInput, CAP_FAN_MIN, CAP_FAN_MAX, t('newGame.customCapFanValidation'))
      : null;

  const minFanForHint = parseMinFan(minFanInput, minFanLowerBound, MIN_FAN_MAX) ?? minFanToWin;
  const contentTopPadding = Math.max(Math.round(insets.top * 0.35), GRID.x2);
  const parsedUnitPerFan = parseDecimalWithinRange(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
  const sampleCapFan = hkScoringPreset === 'traditionalFan' ? capFan : customCapFanForCalc;
  const sampleEffectiveFanRaw = Math.max(sampleFan, minFanForHint);
  const sampleEffectiveFan = sampleCapFan !== null ? Math.min(sampleEffectiveFanRaw, sampleCapFan) : sampleEffectiveFanRaw;
  const sampleBaseAmount = parsedUnitPerFan !== null ? sampleEffectiveFan * parsedUnitPerFan : null;
  const sampleZimoEach = sampleBaseAmount !== null ? sampleBaseAmount : null;
  const sampleDiscarder = sampleBaseAmount !== null ? sampleBaseAmount * 2 : null;
  const currencySymbol = getCurrencyMeta(currencyCode).symbol;
  const syncCooldownSeconds = syncRetryAt === null ? 0 : Math.max(0, Math.ceil((syncRetryAt - cooldownNow) / 1_000));
  const syncCooldownLabel = syncCooldownSeconds > 0
    ? translateWithFallback(t, 'newGame.sync.cooldown', '請等候 {time} 再建立同步房', {
        time: `${String(Math.floor(syncCooldownSeconds / 60)).padStart(2, '0')}:${String(syncCooldownSeconds % 60).padStart(2, '0')}`,
      })
    : translateWithFallback(t, 'newGame.sync.enable', '加入同步玩家');
  const joinedSyncPlayers = useMemo(() => syncPlayers.filter((player) => player.kind === 'member'), [syncPlayers]);
  const assignedSyncPlayerIds = useMemo(
    () => new Set(Object.values(syncSeatAssignments).filter((value): value is string => Boolean(value))),
    [syncSeatAssignments],
  );
  const benchSyncPlayers = useMemo(
    () => joinedSyncPlayers.filter((player) => !assignedSyncPlayerIds.has(player.playerId)),
    [assignedSyncPlayerIds, joinedSyncPlayers],
  );
  const selectedSyncPlayer = useMemo(
    () => joinedSyncPlayers.find((player) => player.playerId === selectedSyncPlayerId) ?? null,
    [joinedSyncPlayers, selectedSyncPlayerId],
  );
  const syncedSeatDisplayNames = useMemo(
    () =>
      SEAT_KEYS.map((seatKey) => {
        const playerId = syncSeatAssignments[seatKey];
        if (!playerId) {
          return null;
        }
        return joinedSyncPlayers.find((player) => player.playerId === playerId)?.displayName ?? null;
      }),
    [joinedSyncPlayers, syncSeatAssignments],
  );
  const screenCopy = {
    subtitle: translateWithFallback(
      t,
      'newGame.headerSubtitle',
      '先設定規則、玩家同起莊方式；需要同步時，再在玩家區下方加入同步玩家。',
    ),
    primaryAction: hasDraftRoom
      ? translateWithFallback(t, 'newGame.sync.start', '開始牌局')
      : t('newGame.create'),
    primaryActionBusy: hasDraftRoom
      ? translateWithFallback(t, 'newGame.sync.starting', '開局中...')
      : t('newGame.creating'),
    confirmTitle: hasDraftRoom
      ? translateWithFallback(t, 'newGame.sync.confirmModal.title', '確認開始牌局')
      : t('newGame.confirmModal.title'),
    confirmSubtitle: hasDraftRoom
      ? translateWithFallback(
          t,
          'newGame.sync.confirmModal.subtitle',
          '請先核對目前座位與同步玩家安排，確認後即會開始同步牌局。',
        )
      : t('newGame.confirmModal.subtitle'),
    confirmAction: hasDraftRoom
      ? translateWithFallback(t, 'newGame.sync.confirmModal.action', '確認開始')
      : t('newGame.confirmModal.action.confirmCreate'),
    creationModeLabel: t('newGame.confirmModal.field.creationMode'),
  };

  useEffect(() => {
    if (seatMode !== 'auto' || joinedSyncPlayers.length < PLAYER_COUNT) {
      return;
    }
    if (autoNames.some((name) => name.trim().length > 0)) {
      return;
    }

    setAutoNames(joinedSyncPlayers.slice(0, PLAYER_COUNT).map((player) => player.displayName.slice(0, MAX_PLAYER_NAME_LENGTH)));
    setPlayersError(null);
  }, [autoNames, joinedSyncPlayers, seatMode]);

  const handleSetPlayer = (index: number, value: string) => {
    const safeName = value.slice(0, MAX_PLAYER_NAME_LENGTH);
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = safeName;
      return next;
    });
    setPlayersError(null);
    setStartingDealerSourceIndex(null);
  };

  const handleSetAutoName = (index: number, value: string) => {
    const safeName = value.slice(0, MAX_PLAYER_NAME_LENGTH);
    setAutoNames((prev) => {
      const next = [...prev];
      next[index] = safeName;
      return next;
    });
    setAutoAssigned(null);
    setAutoAssignedPlayerIds(null);
    setSyncSeatAssignments(EMPTY_SYNC_ASSIGNMENTS);
    setPlayersError(null);
    setStartingDealerSourceIndex(null);
  };

  const handleSeatModeChange = (nextMode: SeatMode) => {
    setSeatMode(nextMode);
    if (nextMode !== 'auto') {
      setAutoAssignedPlayerIds(null);
    }
    setPlayersError(null);
    setSubmitAttempted(false);
    setStartingDealerSourceIndex(null);
  };

  const handleConfirmAutoSeat = () => {
    const fallbackNames = autoNames.map((name, index) => {
      const trimmedName = name.trim();
      if (trimmedName.length > 0) {
        return trimmedName;
      }
      return joinedSyncPlayers[index]?.displayName.slice(0, MAX_PLAYER_NAME_LENGTH).trim() ?? '';
    });

    if (fallbackNames.some((name, index) => name !== autoNames[index])) {
      setAutoNames(fallbackNames);
    }

    if (fallbackNames.some((name) => name.length === 0)) {
      setPlayersError(t('newGame.autoSeatRequired'));
      return;
    }
    const realPlayers = joinedSyncPlayers.slice(0, PLAYER_COUNT);
    const shuffledEntries = shuffleArray(
      fallbackNames.map((name, index) => ({
        name,
        playerId: realPlayers[index]?.playerId ?? null,
      })),
    );

    if (startingDealerMode === 'random') {
      const dealerIndex = Math.floor(Math.random() * PLAYER_COUNT);
      const rotatedNames = rotateArray(
        shuffledEntries.map((entry) => entry.name),
        dealerIndex,
      );
      const rotatedPlayerIds = rotateArray(
        shuffledEntries.map((entry) => entry.playerId),
        dealerIndex,
      );
      setAutoAssigned(rotatedNames);
      setAutoAssignedPlayerIds(rotatedPlayerIds);
      setSyncSeatAssignments(buildSeatAssignmentsFromPlayerIds(rotatedPlayerIds));
      setStartingDealerSourceIndex(0);
    } else {
      setAutoAssigned(shuffledEntries.map((entry) => entry.name));
      setAutoAssignedPlayerIds(shuffledEntries.map((entry) => entry.playerId));
      setSyncSeatAssignments(EMPTY_SYNC_ASSIGNMENTS);
      setStartingDealerSourceIndex(null);
    }

    setPlayersError(null);
  };

  const handleStartingDealerModeChange = (nextMode: StartingDealerMode) => {
    setStartingDealerMode(nextMode);
    setAutoAssigned(null);
    setAutoAssignedPlayerIds(null);
    setSyncSeatAssignments(EMPTY_SYNC_ASSIGNMENTS);
    setStartingDealerSourceIndex(null);
    setPlayersError(null);
  };

  const handleSelectStartingDealer = (index: number) => {
    if (seatMode === 'auto' && autoAssigned && autoAssignedPlayerIds) {
      const rotatedNames = rotateArray(autoAssigned, index);
      const rotatedPlayerIds = rotateArray(autoAssignedPlayerIds, index);
      setAutoAssigned(rotatedNames);
      setAutoAssignedPlayerIds(rotatedPlayerIds);
      setSyncSeatAssignments(buildSeatAssignmentsFromPlayerIds(rotatedPlayerIds));
      setStartingDealerSourceIndex(0);
      setPlayersError(null);
      return;
    }
    setStartingDealerSourceIndex(index);
    setPlayersError(null);
  };

  const scrollToY = (y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  const scrollToPlayersError = () => {
    setTimeout(() => {
      scrollToY(sectionY.current.playersError || sectionY.current.players);
    }, 80);
  };

  const focusInvalidTarget = (target: InvalidTarget) => {
    if (target.kind === 'title') {
      scrollToY(sectionY.current.title);
      setTimeout(() => titleInputRef.current?.focus(), 120);
      return;
    }
    if (target.kind === 'manualPlayer') {
      scrollToY(sectionY.current.players);
      setTimeout(() => manualPlayerRefs.current[target.index]?.focus(), 120);
      return;
    }
    if (target.kind === 'autoPlayer') {
      scrollToY(sectionY.current.players);
      setTimeout(() => autoPlayerRefs.current[target.index]?.focus(), 120);
      return;
    }
    if (target.kind === 'players') {
      scrollToY(sectionY.current.players);
      setTimeout(() => {
        if (seatMode === 'manual') {
          manualPlayerRefs.current[0]?.focus();
        } else {
          autoPlayerRefs.current[0]?.focus();
        }
      }, 120);
      return;
    }
    if (target.kind === 'startingDealer') {
      scrollToY(sectionY.current.players);
      return;
    }
    if (target.kind === 'minFan') {
      scrollToY(sectionY.current.scoring);
      setTimeout(() => minFanInputRef.current?.focus(), 120);
      return;
    }
    if (target.kind === 'unitPerFan') {
      scrollToY(sectionY.current.scoring);
      setTimeout(() => unitPerFanInputRef.current?.focus(), 120);
      return;
    }
    if (target.kind === 'capFan') {
      scrollToY(sectionY.current.scoring);
      setTimeout(() => customCapFanInputRef.current?.focus(), 120);
      return;
    }
    scrollToY(sectionY.current.scoring);
  };

  const validateAndResolveCreatePayload = (): PreparedCreateContext | null => {
    setFormError(null);
    setSubmitAttempted(true);
    if (loading) {
      return null;
    }

    const trimmedTitle = title.trim();
    let nextTitleError: string | null = null;
    let nextPlayersError: string | null = null;
    let invalidTarget: InvalidTarget | null = null;

    if (!trimmedTitle) {
      nextTitleError = t('newGame.requiredTitle');
      invalidTarget = { kind: 'title' };
    }

    let resolvedMinFan = minFanToWin;
    const parsedMinFanWithBound = parseMinFan(minFanInput, minFanLowerBound, MIN_FAN_MAX);
    if (parsedMinFanWithBound === null) {
      focusInvalidTarget(invalidTarget ?? { kind: 'minFan' });
      return null;
    }
    resolvedMinFan = parsedMinFanWithBound;
    setMinFanToWin(parsedMinFanWithBound);

    let resolvedUnitPerFan = unitPerFan;
    let resolvedCustomCapFan = customCapFanForCalc;
    if (hkScoringPreset === 'customTable') {
      const validatedUnitPerFan = parseDecimalWithinRange(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
      if (validatedUnitPerFan === null) {
        focusInvalidTarget(invalidTarget ?? { kind: 'unitPerFan' });
        return null;
      }
      resolvedUnitPerFan = validatedUnitPerFan;
      setUnitPerFan(validatedUnitPerFan);

      if (customCapMode === 'fanCap') {
        const validatedCustomCapFan = parseMinFan(customCapFanInput, CAP_FAN_MIN, CAP_FAN_MAX);
        if (validatedCustomCapFan === null) {
          focusInvalidTarget(invalidTarget ?? { kind: 'capFan' });
          return null;
        }
        resolvedCustomCapFan = validatedCustomCapFan;
        setCustomCapFan(validatedCustomCapFan);
        setCustomCapFanInput(String(validatedCustomCapFan));
      } else {
        resolvedCustomCapFan = null;
      }
    }

    const capToValidate = hkScoringPreset === 'traditionalFan' ? capFan : resolvedCustomCapFan;
    if (capToValidate !== null && resolvedMinFan > capToValidate) {
      setFormError(t('newGame.minFanMustNotExceedCap'));
      focusInvalidTarget(invalidTarget ?? { kind: 'minFan' });
      return null;
    }

    let resolvedPlayers: string[] = [];
    let basePlayers: string[] = [];
    if (seatMode === 'manual') {
      resolvedPlayers = players.map((name, index) => {
        const syncedName = syncedSeatDisplayNames[index]?.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
        if (syncedName) {
          return syncedName;
        }
        return name.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
      });
      basePlayers = [...resolvedPlayers];
      const missingIndexes = resolvedPlayers.map((name, index) => (name.length === 0 ? index : -1)).filter((index) => index >= 0);
      if (missingIndexes.length > 0) {
        if (missingIndexes.length === PLAYER_COUNT) {
          nextPlayersError = t('newGame.requiredPlayersAll');
        } else {
          const missingSeats = missingIndexes.map((index) => `${seatLabels[index]}${t('newGame.playerSeatSuffix')}`);
          nextPlayersError = `${t('newGame.requiredPlayersListPrefix')}${missingSeats.join('，')}${t('newGame.requiredPlayersListSuffix')}`;
        }
        if (!invalidTarget) {
          invalidTarget = { kind: 'manualPlayer', index: missingIndexes[0] };
        }
      }
    } else {
      const trimmed = autoNames.map((name) => name.trim().slice(0, MAX_PLAYER_NAME_LENGTH));
      const missingIndexes = trimmed.map((name, index) => (name.length === 0 ? index : -1)).filter((index) => index >= 0);
      if (missingIndexes.length > 0) {
        if (missingIndexes.length === PLAYER_COUNT) {
          nextPlayersError = t('newGame.requiredPlayersAll');
        } else {
          const missingOrderPlayers = missingIndexes.map(
            (index) => `${t('newGame.playerOrderPrefix')}${index + 1}${t('newGame.playerOrderOnlySuffix')}`,
          );
          const joined =
            missingOrderPlayers.length === 1
              ? missingOrderPlayers[0]
              : `${missingOrderPlayers.slice(0, -1).join(t('newGame.listSeparator'))}${t('newGame.listJoinAnd')}${missingOrderPlayers[missingOrderPlayers.length - 1]}`;
          nextPlayersError = `${t('newGame.requiredPlayersListPrefix')}${joined}${t('newGame.playerOrderSuffix')}`;
        }
        if (!invalidTarget) {
          invalidTarget = { kind: 'autoPlayer', index: missingIndexes[0] };
        }
      } else if (!autoAssigned) {
        nextPlayersError = t('newGame.autoSeatNeedConfirm');
        if (!invalidTarget) {
          invalidTarget = { kind: 'players' };
        }
      } else {
        resolvedPlayers = [...autoAssigned];
        basePlayers = [...resolvedPlayers];
      }
    }

    let selectedStartingDealerIndex = seatMode === 'manual' ? 0 : startingDealerSourceIndex;
    if (seatMode === 'auto') {
      if (
        selectedStartingDealerIndex === null ||
        selectedStartingDealerIndex < 0 ||
        selectedStartingDealerIndex >= PLAYER_COUNT
      ) {
        nextPlayersError =
          startingDealerMode === 'manual' ? t('newGame.startingDealerPickRequired') : t('newGame.startingDealerRequired');
        if (!invalidTarget) {
          invalidTarget = { kind: 'startingDealer' };
        }
      } else {
        resolvedPlayers = rotatePlayersToEast(basePlayers, selectedStartingDealerIndex);
      }
    } else {
      resolvedPlayers = [...basePlayers];
    }

    setTitleError(nextTitleError);
    setPlayersError(nextPlayersError);
    if (nextTitleError || nextPlayersError) {
      if (nextPlayersError && (!invalidTarget || invalidTarget.kind === 'players')) {
        scrollToPlayersError();
      }
      if (invalidTarget) {
        focusInvalidTarget(invalidTarget);
      }
      return null;
    }

    const gameId = makeId('game');
    const playerInputs = resolvedPlayers.map((name, index) => ({
      id: makeId('player'),
      gameId,
      name,
      seatIndex: index,
    }));

    const rules: RulesV1 = {
      ...getDefaultRules('HK'),
      variant: 'HK',
      mode: 'HK',
      languageDefault: language,
      currencyCode,
      currencySymbol: getCurrencyMeta(currencyCode).symbol,
    };

    const hkBase = rules.hk ?? getDefaultRules('HK').hk!;
    rules.hk = {
      ...hkBase,
      scoringPreset: hkScoringPreset,
      gunMode: hkGunMode,
      stakePreset: hkStakePreset,
      unitPerFan: resolvedUnitPerFan,
      capFan: hkScoringPreset === 'traditionalFan' ? capFan : resolvedCustomCapFan,
    };
    rules.minFanToWin = resolvedMinFan;

    return {
      creationMode: hasDraftRoom ? 'online' : 'local',
      gameId,
      trimmedTitle,
      resolvedPlayers,
      startingDealerSourceIndex: selectedStartingDealerIndex as number,
      playerInputs,
      rules,
    };
  };

  const validateDraftRoomPrerequisites = (): { trimmedTitle: string; rules: RulesV1 } | null => {
    setFormError(null);

    const trimmedTitle = title.trim();
    let invalidTarget: InvalidTarget | null = null;
    let nextTitleError: string | null = null;

    if (!trimmedTitle) {
      nextTitleError = t('newGame.requiredTitle');
      invalidTarget = { kind: 'title' };
    }

    let resolvedMinFan = minFanToWin;
    const parsedMinFanWithBound = parseMinFan(minFanInput, minFanLowerBound, MIN_FAN_MAX);
    if (parsedMinFanWithBound === null) {
      focusInvalidTarget(invalidTarget ?? { kind: 'minFan' });
      return null;
    }
    resolvedMinFan = parsedMinFanWithBound;
    setMinFanToWin(parsedMinFanWithBound);

    let resolvedUnitPerFan = unitPerFan;
    let resolvedCustomCapFan = customCapFanForCalc;
    if (hkScoringPreset === 'customTable') {
      const validatedUnitPerFan = parseDecimalWithinRange(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
      if (validatedUnitPerFan === null) {
        focusInvalidTarget(invalidTarget ?? { kind: 'unitPerFan' });
        return null;
      }
      resolvedUnitPerFan = validatedUnitPerFan;
      setUnitPerFan(validatedUnitPerFan);

      if (customCapMode === 'fanCap') {
        const validatedCustomCapFan = parseMinFan(customCapFanInput, CAP_FAN_MIN, CAP_FAN_MAX);
        if (validatedCustomCapFan === null) {
          focusInvalidTarget(invalidTarget ?? { kind: 'capFan' });
          return null;
        }
        resolvedCustomCapFan = validatedCustomCapFan;
        setCustomCapFan(validatedCustomCapFan);
        setCustomCapFanInput(String(validatedCustomCapFan));
      } else {
        resolvedCustomCapFan = null;
      }
    }

    const capToValidate = hkScoringPreset === 'traditionalFan' ? capFan : resolvedCustomCapFan;
    if (capToValidate !== null && resolvedMinFan > capToValidate) {
      setFormError(t('newGame.minFanMustNotExceedCap'));
      focusInvalidTarget(invalidTarget ?? { kind: 'minFan' });
      return null;
    }

    setTitleError(nextTitleError);
    if (nextTitleError) {
      if (invalidTarget) {
        focusInvalidTarget(invalidTarget);
      }
      return null;
    }

    const rules: RulesV1 = {
      ...getDefaultRules('HK'),
      variant: 'HK',
      mode: 'HK',
      languageDefault: language,
      currencyCode,
      currencySymbol: getCurrencyMeta(currencyCode).symbol,
    };

    rules.hk = {
      ...(rules.hk ?? getDefaultRules('HK').hk!),
      scoringPreset: hkScoringPreset,
      gunMode: hkGunMode,
      stakePreset: hkStakePreset,
      unitPerFan: resolvedUnitPerFan,
      capFan: hkScoringPreset === 'traditionalFan' ? capFan : resolvedCustomCapFan,
    };
    rules.minFanToWin = resolvedMinFan;

    return { trimmedTitle, rules };
  };

  const clearDraftSyncState = () => {
    setDraftRoom(null);
    setInvite(null);
    setInviteShareVisible(false);
    setSyncPlayers([]);
    setSelectedSyncPlayerId('');
    setSyncSeatAssignments(EMPTY_SYNC_ASSIGNMENTS);
    setDebugSyncJoinCount(0);
  };

  const restoreOpenSyncRoom = useCallback(async (room: Room, nextInvite: InvitePayload) => {
    const localDraft = await loadActiveHostedRoomDraft(room.roomId);
    setSessionUid(room.hostUid);
    setDraftRoom(room);
    setInvite(nextInvite);
    setTitle(room.title);
    const serializedRules = typeof room.rulesSnapshot.serializedRules === 'string'
      ? room.rulesSnapshot.serializedRules
      : null;
    if (serializedRules) {
      const recoveredRules = parseRules(serializedRules, 'HK');
      setCurrencyCode(recoveredRules.currencyCode);
      setHkScoringPreset(recoveredRules.hk?.scoringPreset ?? 'traditionalFan');
      setHkGunMode(recoveredRules.hk?.gunMode ?? 'fullGun');
      setHkStakePreset(recoveredRules.hk?.stakePreset ?? 'TWO_FIVE_CHICKEN');
      setUnitPerFan(recoveredRules.hk?.unitPerFan ?? 1);
      setUnitPerFanInput(String(recoveredRules.hk?.unitPerFan ?? 1));
      setMinFanToWin(recoveredRules.minFanToWin ?? 3);
      setMinFanInput(String(recoveredRules.minFanToWin ?? 3));
      if (recoveredRules.hk?.capFan === 8 || recoveredRules.hk?.capFan === 10 || recoveredRules.hk?.capFan === 13) {
        setCapFan(recoveredRules.hk.capFan);
      }
    }
    if (localDraft) {
      setSeatMode(localDraft.seatMode);
      setPlayers(localDraft.players.slice(0, PLAYER_COUNT));
      setAutoNames(localDraft.autoNames.slice(0, PLAYER_COUNT));
      setAutoAssigned(localDraft.autoAssigned);
      setAutoAssignedPlayerIds(localDraft.autoAssignedPlayerIds);
      setStartingDealerMode(localDraft.startingDealerMode);
      setStartingDealerSourceIndex(localDraft.startingDealerSourceIndex);
      setSyncSeatAssignments(localDraft.syncSeatAssignments);
    } else {
      setSyncSeatAssignments(EMPTY_SYNC_ASSIGNMENTS);
      setSelectedSyncPlayerId(room.hostUid);
    }
    setSyncRetryAt(null);
    setFormError(null);
  }, []);

  useEffect(() => {
    if (recoveryStartedRef.current) return;
    recoveryStartedRef.current = true;
    loadActiveHostedRoomPointer()
      .then(async (pointer) => {
        if (!pointer) return;
        const session = await getCurrentSession();
        if (!session || session.uid !== pointer.uid) {
          await clearActiveHostedRoomPointer(pointer);
          return;
        }
        setSyncBusy(true);
        const recovered = await recoverHostedRoom(session.uid, pointer.roomId);
        if (recovered.kind === 'open') {
          await restoreOpenSyncRoom(recovered.room, recovered.invite);
        } else if (recovered.kind === 'active') {
          navigation.replace('MultiplayerGameTable', { roomId: recovered.room.roomId });
        } else if (recovered.kind === 'cleaning') {
          await deleteRoomAndFallbackToLocal(recovered.roomId, session.uid);
          const afterCleanup = await recoverHostedRoom(session.uid);
          if (afterCleanup.kind === 'none') setSyncRetryAt(afterCleanup.retryAt);
        } else {
          setSyncRetryAt(recovered.retryAt);
        }
      })
      .catch((error) => {
        console.error('[Cloud] restore hosted room failed', error);
        setFormError(translateWithFallback(t, 'newGame.sync.restoreFailed', '未能恢復上次同步房，請稍後再試。'));
      })
      .finally(() => setSyncBusy(false));
  }, [navigation, restoreOpenSyncRoom, t]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      loadPendingHostedRoomCleanup()
        .then(async (pendingCleanup) => {
          if (!pendingCleanup) return;
          const session = await getCurrentSession();
          if (!session || session.uid !== pendingCleanup.uid) return;

          // A successful read is only a connectivity probe. Remote cleanup still requires confirmation.
          await getRoom(pendingCleanup.roomId);
          if (!alive) return;
          setPendingCleanupRoomId(pendingCleanup.roomId);

          Alert.alert(
            t('newGame.sync.pendingCleanup.title'),
            t('newGame.sync.pendingCleanup.body'),
            [
              { text: t('newGame.sync.pendingCleanup.later'), style: 'cancel' },
              {
                text: t('newGame.sync.pendingCleanup.confirm'),
                style: 'destructive',
                onPress: async () => {
                  try {
                    setSyncBusy(true);
                    await deleteRoomAndFallbackToLocal(pendingCleanup.roomId, pendingCleanup.uid);
                    await clearPendingHostedRoomCleanup(pendingCleanup.roomId);
                    if (alive) {
                      setPendingCleanupRoomId(null);
                      Alert.alert(
                        t('newGame.sync.pendingCleanup.doneTitle'),
                        t('newGame.sync.pendingCleanup.doneBody'),
                      );
                    }
                  } catch (error) {
                    console.error('[Cloud] pending room cleanup failed', error);
                    if (alive) {
                      Alert.alert(
                        t('newGame.sync.pendingCleanup.failedTitle'),
                        t('newGame.sync.pendingCleanup.failedBody'),
                      );
                    }
                  } finally {
                    if (alive) setSyncBusy(false);
                  }
                },
              },
            ],
          );
        })
        .catch(() => {
          // Firebase is still unavailable. Keep the marker and try again when this screen regains focus.
        });

      return () => {
        alive = false;
      };
    }, [t]),
  );

  const handleKeepPlayerOnBench = (playerId: string) => {
    setSyncSeatAssignments((prev) => {
      const next = { ...prev };
      for (const seatKey of SEAT_KEYS) {
        if (next[seatKey] === playerId) {
          next[seatKey] = null;
        }
      }
      return next;
    });
    setSelectedSyncPlayerId('');
  };

  const handleSelectSyncPlayer = (playerId: string) => {
    setSelectedSyncPlayerId((current) => (current === playerId ? '' : playerId));
  };

  const handleAssignSyncPlayerToSeat = (seatKey: SeatKey) => {
    if (!selectedSyncPlayerId) {
      return;
    }
    const assignSeat = () => {
      setSyncSeatAssignments((prev) => {
        const next = { ...prev };
        for (const key of SEAT_KEYS) {
          if (next[key] === selectedSyncPlayerId) {
            next[key] = null;
          }
        }
        next[seatKey] = selectedSyncPlayerId;
        return next;
      });
    };

    const seatIndex = SEAT_KEYS.indexOf(seatKey);
    const localSeatName = seatIndex >= 0 ? players[seatIndex]?.trim() ?? '' : '';
    const alreadyAssignedSyncPlayerId = syncSeatAssignments[seatKey];

    if (!alreadyAssignedSyncPlayerId && localSeatName) {
      Alert.alert(
        translateWithFallback(t, 'newGame.sync.confirmTakeoverTitle', '接管座位？'),
        translateWithFallback(
          t,
          'newGame.sync.confirmTakeoverMessage',
          '{seatLabel}已填入「{playerName}」。確認後，已選同步玩家會接管這個座位。',
          {
            seatLabel: seatIndex >= 0 ? seatLabels[seatIndex] : seatKey,
            playerName: localSeatName,
          },
        ),
        [
          { text: translateWithFallback(t, 'common.cancel', '取消'), style: 'cancel' },
          {
            text: translateWithFallback(t, 'newGame.sync.confirmTakeoverAction', '確認接管'),
            onPress: assignSeat,
          },
        ],
      );
      return;
    }

    assignSeat();
  };

  const handleEnableSync = async () => {
    if (pendingCleanupRoomId) {
      setFormError(t('newGame.sync.pendingCleanup.blocked'));
      return;
    }
    const draftContext = validateDraftRoomPrerequisites();
    if (!draftContext || syncBusy || loading || hasDraftRoom) {
      return;
    }

    try {
      setSyncBusy(true);
      const session = await ensureSession('google');
      setSessionUid(session.uid);
      const recovered = await recoverHostedRoom(session.uid);
      if (recovered.kind === 'open') {
        await restoreOpenSyncRoom(recovered.room, recovered.invite);
        return;
      }
      if (recovered.kind === 'active') {
        navigation.replace('MultiplayerGameTable', { roomId: recovered.room.roomId });
        return;
      }
      if (recovered.kind === 'cleaning') {
        await deleteRoomAndFallbackToLocal(recovered.roomId, session.uid);
        const afterCleanup = await recoverHostedRoom(session.uid);
        if (afterCleanup.kind === 'none') setSyncRetryAt(afterCleanup.retryAt);
        return;
      }
      if (recovered.retryAt && recovered.retryAt > Date.now()) {
        setSyncRetryAt(recovered.retryAt);
        setCooldownNow(Date.now());
        return;
      }
      const profile = await getProfile(session.uid);
      setHostDisplayName(normalizeDisplayName(profile?.displayName, session.uid));
      setHostNameError(null);
      setPendingSyncContext(draftContext);
      setHostNameVisible(true);
      setFormError(null);
    } catch (error) {
      console.error('[Cloud] enable sync failed', error);
      setFormError(t('errors.createGame'));
    } finally {
      setSyncBusy(false);
    }
  };

  const handleConfirmHostName = async () => {
    const confirmedName = hostDisplayName.trim();
    if (!pendingSyncContext || !sessionUid || confirmedName.length < 1 || confirmedName.length > MAX_PLAYER_NAME_LENGTH) {
      setHostNameError(translateWithFallback(t, 'newGame.sync.hostNameInvalid', '名稱需要 1–10 個字。'));
      return;
    }
    try {
      setSyncBusy(true);
      setHostNameError(null);
      await updateProfile(sessionUid, { displayName: confirmedName });
      const result = await createRoom({
        hostUid: sessionUid,
        hostDisplayName: confirmedName,
        title: pendingSyncContext.trimmedTitle,
        memberCap: 8,
        rulesSnapshot: {
          title: pendingSyncContext.trimmedTitle,
          currencyCode: pendingSyncContext.rules.currencyCode,
          currencySymbol: pendingSyncContext.rules.currencySymbol,
          mode: pendingSyncContext.rules.mode,
          serializedRules: serializeRules(pendingSyncContext.rules),
        },
      });
      if (!result.ok) {
        if (result.code === 'RATE_LIMITED') {
          setSyncRetryAt(result.retryAt);
          setCooldownNow(Date.now());
          setHostNameVisible(false);
          return;
        }
        if (result.code === 'CLEANUP_IN_PROGRESS') {
          await deleteRoomAndFallbackToLocal(result.roomId, sessionUid);
          setHostNameVisible(false);
          return;
        }
        throw new Error(result.message);
      }
      if (result.room.status === 'active') {
        setHostNameVisible(false);
        navigation.replace('MultiplayerGameTable', { roomId: result.room.roomId });
        return;
      }
      if (!result.invite) throw new Error('Open room invite is missing');
      await restoreOpenSyncRoom(result.room, result.invite);
      setHostNameVisible(false);
      setPendingSyncContext(null);
      setDebugSyncJoinCount(0);
    } catch (error) {
      console.error('[Cloud] confirm sync host name failed', error);
      setHostNameError(translateWithFallback(t, 'newGame.sync.createFailed', '未能建立同步房，請稍後再試。'));
    } finally {
      setSyncBusy(false);
    }
  };

  const handleOpenInviteShare = useCallback(async () => {
    if (!draftRoom || !sessionUid) {
      return;
    }
    setInviteBusy(true);
    try {
      const nextInvite = invite ?? (await getOrCreateActiveInvite(draftRoom.roomId, sessionUid));
      setInvite(nextInvite);
      setInviteShareVisible(true);
    } catch (error) {
      Alert.alert(
        translateWithFallback(t, 'roomLobby.alert.createInviteFailedTitle', '建立邀請失敗'),
        String(error),
      );
    } finally {
      setInviteBusy(false);
    }
  }, [draftRoom, invite, sessionUid, t]);

  const handleShareInvite = useCallback(async () => {
    if (!invite || !draftRoom) {
      return;
    }
    try {
      await Share.share({
        title: draftRoom.title,
        message: buildInviteShareMessage(
          draftRoom.title,
          translateWithFallback(t, 'roomLobby.hostTools.roomCode', '房間代碼'),
          invite,
        ),
      });
    } catch (error) {
      Alert.alert(translateWithFallback(t, 'roomLobby.alert.shareInviteFailedTitle', '分享邀請失敗'), String(error));
    }
  }, [draftRoom, invite, t]);

  const handleCancelSync = () => {
    if (!draftRoom || !sessionUid) {
      return;
    }
    Alert.alert(
      translateWithFallback(t, 'newGame.sync.cancelConfirmTitle', '取消同步？'),
      translateWithFallback(
        t,
        'newGame.sync.cancelConfirmMessage',
        '取消後會刪除這個同步房，並回到純本地建局狀態。',
      ),
      [
        { text: translateWithFallback(t, 'newGame.sync.cancelConfirmStay', '繼續保留'), style: 'cancel' },
        {
          text: translateWithFallback(t, 'newGame.sync.cancelConfirmAction', '刪除同步房'),
          style: 'destructive',
          onPress: () => {
            setSyncBusy(true);
            deleteRoomAndFallbackToLocal(draftRoom.roomId, sessionUid)
              .then(() => {
                clearDraftSyncState();
              })
              .catch((error) => {
                Alert.alert(translateWithFallback(t, 'roomLobby.alert.startFailedTitle', '操作失敗'), String(error));
              })
              .finally(() => setSyncBusy(false));
          },
        },
      ],
    );
  };

  const handleAddDebugSyncPlayer = async () => {
    if (!DEBUG_FLAGS.enableSyncTestTools || !draftRoom || !sessionUid || syncBusy) {
      return;
    }

    try {
      setSyncBusy(true);
      const playerNumber = debugSyncJoinCount + 1;
      const displayName = DEBUG_SYNC_PLAYER_NAMES[debugSyncJoinCount] ?? `測試玩家 ${playerNumber}`;
      // A dev-only player is not an authenticated Firebase user. Model it as a
      // temporary player so the host stays within the same permission boundary.
      await addTemporaryPlayers({
        roomId: draftRoom.roomId,
        createdByUid: sessionUid,
        displayNames: [displayName],
      });
      setDebugSyncJoinCount(playerNumber);
    } catch (error) {
      Alert.alert(
        translateWithFallback(t, 'newGame.sync.debugAddFailedTitle', '加入虛擬真人玩家失敗'),
        String(error),
      );
    } finally {
      setSyncBusy(false);
    }
  };

  const executeCreateGame = async (context: PreparedCreateContext): Promise<boolean> => {
    if (draftRoom) {
      try {
        setLoading(true);
        const session = sessionUid ? { uid: sessionUid } : await ensureSession('google');
        if (!sessionUid) {
          setSessionUid(session.uid);
        }

        const realPlayerCount = syncPlayers.filter((player) => player.kind === 'member').length;
        if (realPlayerCount <= 1) {
          await deleteRoomAndFallbackToLocal(draftRoom.roomId, session.uid);
          clearDraftSyncState();
          await createGameWithPlayers(
            {
              id: context.gameId,
              title: context.trimmedTitle,
              createdAt: Date.now(),
              currencySymbol: context.rules.currencySymbol,
              variant: context.rules.variant,
              rulesJson: serializeRules(context.rules),
              startingDealerSeatIndex: 0,
              languageOverride: null,
            },
            context.playerInputs,
          );
          navigation.replace('GameTable', { gameId: context.gameId });
          return true;
        }

        const realSeatsCount = Object.values(syncSeatAssignments).filter(Boolean).length;
        if (realSeatsCount < 2) {
          setFormError(
            translateWithFallback(
              t,
              'newGame.sync.needTwoRealSeats',
              '同步牌局最少要安排兩位已加入玩家上枱，先可以開始。',
            ),
          );
          return false;
        }

        const nextSeats = { ...EMPTY_SYNC_ASSIGNMENTS } as Record<SeatKey, string>;
        const missingTemporaryPlayers: Array<{ seatKey: SeatKey; displayName: string }> = [];
        for (let index = 0; index < PLAYER_COUNT; index += 1) {
          const seatKey = SEAT_KEYS[index];
          const assignedRealPlayerId = syncSeatAssignments[seatKey];
          if (assignedRealPlayerId) {
            nextSeats[seatKey] = assignedRealPlayerId;
            continue;
          }
          missingTemporaryPlayers.push({
            seatKey,
            displayName: context.resolvedPlayers[index],
          });
        }
        const createdTemporaryPlayers = missingTemporaryPlayers.length
          ? await addTemporaryPlayers({
            roomId: draftRoom.roomId,
            createdByUid: session.uid,
            displayNames: missingTemporaryPlayers.map((player) => player.displayName),
          })
          : [];
        missingTemporaryPlayers.forEach((player, index) => {
          nextSeats[player.seatKey] = createdTemporaryPlayers[index].playerId;
        });

        const startResult = await startRoom({
          roomId: draftRoom.roomId,
          startedByUid: session.uid,
          baseVersion: draftRoom.currentVersion,
          nextSeats,
        });
        if (!startResult.ok) {
          setFormError(startResult.message);
          return false;
        }

        navigation.replace('MultiplayerGameTable', { roomId: draftRoom.roomId });
        return true;
      } catch (err) {
        console.error('[Cloud] start sync room failed', err);
        setFormError(t('errors.createGame'));
        return false;
      } finally {
        setLoading(false);
      }
    }

    try {
      setLoading(true);
      await createGameWithPlayers(
        {
          id: context.gameId,
          title: context.trimmedTitle,
          createdAt: Date.now(),
          currencySymbol: context.rules.currencySymbol,
          variant: context.rules.variant,
          rulesJson: serializeRules(context.rules),
          startingDealerSeatIndex: 0,
          languageOverride: null,
        },
        context.playerInputs,
      );
      navigation.replace('GameTable', { gameId: context.gameId });
      return true;
    } catch (err) {
      console.error('[DB] createGame failed', err);
      setFormError(t('errors.createGame'));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const buildConfirmSections = (context: PreparedCreateContext): ConfirmSections => {
    const modeLabel = t('newGame.mode.hk');

    const gameFields: ConfirmField[] = [
      { label: t('newGame.confirmModal.field.title'), value: context.trimmedTitle },
      {
        label: screenCopy.creationModeLabel,
        value:
          context.creationMode === 'online'
            ? translateWithFallback(t, 'newGame.creationMode.sync', '同步牌局')
            : t('newGame.creationMode.local'),
      },
      { label: t('newGame.confirmModal.field.mode'), value: modeLabel },
      { label: t('newGame.confirmModal.field.currency'), value: formatCurrencyUnit(context.rules.currencyCode) },
    ];

    const scoringFields: ConfirmField[] = [];

    if (context.rules.hk) {
      scoringFields.push({
        label: t('newGame.confirmModal.field.scoringMethod'),
        value: context.rules.hk.scoringPreset === 'customTable' ? t('newGame.hkPreset.custom') : t('newGame.hkPreset.traditional'),
      });
      if (context.rules.hk.scoringPreset === 'traditionalFan') {
        scoringFields.push({
          label: t('newGame.confirmModal.field.gunMode'),
          value: context.rules.hk.gunMode === 'halfGun' ? t('newGame.hkGunMode.half') : t('newGame.hkGunMode.full'),
        });
        scoringFields.push({
          label: t('newGame.confirmModal.field.stakePreset'),
          value:
            context.rules.hk.stakePreset === 'TWO_FIVE_CHICKEN'
              ? t('newGame.hkStakePreset.twoFiveChicken')
              : context.rules.hk.stakePreset === 'FIVE_ONE'
              ? t('newGame.hkStakePreset.fiveOne')
              : t('newGame.hkStakePreset.oneTwo'),
        });
      }
      scoringFields.push({
        label: t('newGame.confirmModal.field.capFan'),
        value: context.rules.hk.capFan === null ? t('newGame.capMode.none') : `${t('newGame.capMode.fanCap')} ${context.rules.hk.capFan}`,
      });
      if (context.rules.hk.scoringPreset === 'customTable') {
        scoringFields.push({ label: t('newGame.confirmModal.field.unitPerFan'), value: String(context.rules.hk.unitPerFan ?? 1) });
      }
      scoringFields.push({ label: t('newGame.confirmModal.field.minFan'), value: String(context.rules.minFanToWin ?? minFanToWin) });
    }

    let playerFields: ConfirmField[] = [];
    if (context.creationMode === 'online') {
      playerFields = context.resolvedPlayers.map((player, index) => {
        const seatKey = SEAT_KEYS[index];
        const syncPlayer = syncSeatAssignments[seatKey]
          ? joinedSyncPlayers.find((joinedPlayer) => joinedPlayer.playerId === syncSeatAssignments[seatKey]) ?? null
          : null;
        return {
          label: `${seatLabels[index]}${t('newGame.playerSeatSuffix')}`,
          value: syncPlayer?.displayName ?? player,
        };
      });
    } else {
      const playerLabels: TranslationKey[] = [
        'newGame.confirmModal.field.playersEast',
        'newGame.confirmModal.field.playersSouth',
        'newGame.confirmModal.field.playersWest',
        'newGame.confirmModal.field.playersNorth',
      ];
      playerFields = context.resolvedPlayers.map((player, index) => ({ label: t(playerLabels[index]), value: player }));
      playerFields[0] = {
        label: `${t(playerLabels[0])} (${t('newGame.dealerBadge')})`,
        value: context.resolvedPlayers[0],
      };
    }

    return { game: gameFields, scoring: scoringFields, players: playerFields };
  };

  const handlePressCreate = () => {
    const context = validateAndResolveCreatePayload();
    if (!context) {
      return;
    }
    setPendingPayload(context);
    setConfirmVisible(true);
  };

  const handleConfirmCreate = async () => {
    if (!pendingPayload || loading || confirmBusy) {
      return;
    }
    setConfirmBusy(true);
    setConfirmVisible(false);
    const success = await executeCreateGame(pendingPayload);
    if (success) {
      setPendingPayload(null);
    } else {
      setConfirmVisible(true);
    }
    setConfirmBusy(false);
  };

  const adjustMinFan = (delta: number) => {
    const next = clamp(minFanToWin + delta, minFanLowerBound, MIN_FAN_MAX);
    setMinFanToWin(next);
    setMinFanInput(String(next));
    setMinFanTouched(true);
  };

  const adjustUnitPerFan = (delta: number) => {
    const next = clamp(Number((unitPerFan + delta).toFixed(2)), UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
    setUnitPerFan(next);
    setUnitPerFanInput(String(next));
    setUnitPerFanTouched(true);
  };

  const adjustSampleFan = (delta: number) => {
    const next = clamp(sampleFan + delta, SAMPLE_FAN_MIN, SAMPLE_FAN_MAX);
    setSampleFan(next);
  };

  const confirmSections = pendingPayload ? buildConfirmSections(pendingPayload) : null;
  const scoringHintLines = getStakePresetHintLines(hkStakePreset, hkGunMode, minFanForHint, capFan, t);
  const stakePaytableRules = useMemo<RulesV1 | null>(() => {
    if (hkScoringPreset !== 'traditionalFan') {
      return null;
    }
    const defaultRules = getDefaultRules('HK');
    return {
      ...defaultRules,
      languageDefault: language,
      currencyCode,
      currencySymbol,
      minFanToWin: minFanForHint,
      hk: {
        ...defaultRules.hk!,
        gunMode: hkGunMode,
        stakePreset: hkStakePreset,
        capFan,
      },
    };
  }, [capFan, currencyCode, currencySymbol, hkGunMode, hkScoringPreset, hkStakePreset, language, minFanForHint]);

  return (
    <ScreenContainer style={styles.container} horizontalPadding={0} includeTopInset={false} includeBottomInset={false}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: contentTopPadding, paddingBottom: Math.max(insets.bottom, GRID.x2) + 64 },
          ]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
        <View
          onLayout={(event) => {
            sectionY.current.title = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.headerBlock}>
            <AppText style={styles.headerSubtitle}>{screenCopy.subtitle}</AppText>
          </View>
          <GameTitleSection
            label={t('newGame.gameTitle')}
            value={title}
            placeholder={t('newGame.gameTitlePlaceholder')}
            onChangeText={(value) => {
              setTitle(value);
              setTitleError(null);
            }}
            inputRef={titleInputRef}
            error={titleError}
            disabled={setupLocked || loading}
          />
        </View>

        <CurrencySection
          title={t('newGame.currencyTitle')}
          value={currencyCode}
          onChange={(nextCurrencyCode) => {
            currencyManuallyChangedRef.current = true;
            setCurrencyCode(nextCurrencyCode);
          }}
          disabled={loading || setupLocked}
          labels={{ hkd: t('currency.hkd'), twd: t('currency.twd'), cny: t('currency.cny') }}
          helperText={`${t('newGame.currencySelectedPrefix')}${formatCurrencyUnit(currencyCode)}`}
        />

        <View
          onLayout={(event) => {
            sectionY.current.scoring = event.nativeEvent.layout.y;
          }}
        >
          <ScoringSection
            hkScoringPreset={hkScoringPreset}
            hkGunMode={hkGunMode}
            hkStakePreset={hkStakePreset}
            capFan={capFan}
            customCapMode={customCapMode}
            customCapFanInput={customCapFanInput}
            minFanInput={minFanInput}
            unitPerFanInput={unitPerFanInput}
            sampleFan={sampleFan}
            minFanError={minFanError}
            unitPerFanError={unitPerFanError}
            customCapFanError={customCapFanError}
            currencySymbol={currencySymbol}
            sampleBaseAmount={sampleBaseAmount}
            sampleEffectiveFan={sampleEffectiveFan}
            sampleZimoEach={sampleZimoEach}
            sampleDiscarder={sampleDiscarder}
            disabled={loading || setupLocked}
            minFanInputRef={minFanInputRef}
            unitPerFanInputRef={unitPerFanInputRef}
            customCapFanInputRef={customCapFanInputRef}
            labels={{
              title: t('newGame.scoringMethod'),
              hkPresetTraditional: t('newGame.hkPreset.traditional'),
              hkPresetCustom: t('newGame.hkPreset.custom'),
              hkGunModeLabel: t('newGame.hkGunModeLabel'),
              hkGunModeHalf: t('newGame.hkGunMode.half'),
              hkGunModeFull: t('newGame.hkGunMode.full'),
              hkStakePresetLabel: t('newGame.hkStakePresetLabel'),
              hkStakePresetTwoFive: t('newGame.hkStakePreset.twoFiveChicken'),
              hkStakePresetFiveOne: t('newGame.hkStakePreset.fiveOne'),
              hkStakePresetOneTwo: t('newGame.hkStakePreset.oneTwo'),
              minFanThresholdLabel: t('newGame.minFanThresholdLabel'),
              hkThresholdHelp: t('newGame.hkThresholdHelp'),
              unitPerFanLabel: t('newGame.unitPerFanLabel'),
              unitPerFanHelp: t('newGame.unitPerFanHelp'),
              capModeLabel: t('newGame.capModeLabel'),
              capModeEight: t('newGame.capMode.eight'),
              capModeTen: t('newGame.capMode.ten'),
              capModeThirteen: t('newGame.capMode.thirteen'),
              capFanLabel: t('newGame.capFanLabel'),
              capFanHelp: t('newGame.capFanHelp'),
              customCapModeLabel: t('newGame.customCapModeLabel'),
              customCapModeNone: t('newGame.customCapMode.none'),
              customCapModeFanCap: t('newGame.customCapMode.fanCap'),
              customCapFanLabel: t('newGame.customCapFanLabel'),
              customCapNoneHelp: t('newGame.customCapNoneHelp'),
              customCapValueHelp: t('newGame.customCapValueHelp'),
              sampleFanLabel: t('newGame.sampleFanLabel'),
              realtimeEffectiveFan: t('newGame.realtime.effectiveFan'),
              realtimeZimoSplitLabel: t('newGame.realtime.custom.zimo'),
              realtimeDiscarderLabel: t('newGame.realtime.custom.discard'),
            }}
            stakePresetHintLines={scoringHintLines}
            onShowStakePaytable={() => setStakePaytableVisible(true)}
            onHkScoringPresetChange={(value) => {
              setHkScoringPreset(value);
              if (value === 'customTable') {
                setHkGunMode('fullGun');
              }
            }}
            onHkGunModeChange={setHkGunMode}
            onHkStakePresetChange={setHkStakePreset}
            onCapFanChange={setCapFan}
            onCustomCapModeChange={(value) => {
              setCustomCapMode(value);
              setCustomCapFanTouched(false);
            }}
            onCustomCapFanInputChange={(value) => setCustomCapFanInput(value.replace(/[^0-9]/g, ''))}
            onCustomCapFanBlur={() => {
              setCustomCapFanTouched(true);
              const parsed = parseMinFan(customCapFanInput, CAP_FAN_MIN, CAP_FAN_MAX);
              if (parsed !== null) {
                setCustomCapFan(parsed);
                setCustomCapFanInput(String(parsed));
              }
            }}
            onCustomCapFanIncrement={() => {
              const next = clamp(customCapFan + 1, CAP_FAN_MIN, CAP_FAN_MAX);
              setCustomCapFan(next);
              setCustomCapFanInput(String(next));
              setCustomCapFanTouched(true);
            }}
            onCustomCapFanDecrement={() => {
              const next = clamp(customCapFan - 1, CAP_FAN_MIN, CAP_FAN_MAX);
              setCustomCapFan(next);
              setCustomCapFanInput(String(next));
              setCustomCapFanTouched(true);
            }}
            onMinFanInputChange={(value) => setMinFanInput(value.replace(/[^0-9]/g, ''))}
            onMinFanBlur={() => {
              setMinFanTouched(true);
              const parsedWithBound = parseMinFan(minFanInput, minFanLowerBound, MIN_FAN_MAX);
              if (parsedWithBound !== null) {
                setMinFanToWin(parsedWithBound);
                setMinFanInput(String(parsedWithBound));
              }
            }}
            onMinFanIncrement={() => adjustMinFan(1)}
            onMinFanDecrement={() => adjustMinFan(-1)}
            onUnitPerFanInputChange={(value) => setUnitPerFanInput(value.replace(/[^0-9.]/g, ''))}
            onUnitPerFanBlur={() => {
              setUnitPerFanTouched(true);
              const parsed = parseDecimalWithinRange(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
              if (parsed !== null) {
                setUnitPerFan(parsed);
                setUnitPerFanInput(String(parsed));
              }
            }}
            onUnitPerFanIncrement={() => adjustUnitPerFan(0.1)}
            onUnitPerFanDecrement={() => adjustUnitPerFan(-0.1)}
            onSampleFanInputChange={(value) => {
              const parsed = parseMinFan(value.replace(/[^0-9]/g, ''), SAMPLE_FAN_MIN, SAMPLE_FAN_MAX);
              if (parsed !== null) {
                setSampleFan(parsed);
              }
            }}
            onSampleFanIncrement={() => adjustSampleFan(1)}
            onSampleFanDecrement={() => adjustSampleFan(-1)}
          />
        </View>

        <View
          onLayout={(event) => {
            sectionY.current.players = event.nativeEvent.layout.y;
          }}
        >
          <PlayersSection
            seatMode={seatMode}
            seatLabels={seatLabels}
            players={players}
            autoNames={autoNames}
            autoAssigned={autoAssigned}
            startingDealerMode={startingDealerMode}
            startingDealerSourceIndex={startingDealerSourceIndex}
            playersError={playersError}
            disabled={loading}
            manualPlayerRefs={manualPlayerRefs}
            autoPlayerRefs={autoPlayerRefs}
            labels={{
              sectionTitle: t('newGame.players'),
              seatModeTitle: t('newGame.seatModeTitle'),
              seatModeManual: t('newGame.seatMode.manual'),
              seatModeAuto: t('newGame.seatMode.auto'),
              playerManualHintPrefix: t('newGame.playerManualHintPrefix'),
              playerManualHintSuffix: t('newGame.playerManualHintSuffix'),
              playerAutoHintPrefix: t('newGame.playerAutoHintPrefix'),
              playerAutoHintSuffix: t('newGame.playerAutoHintSuffix'),
              playerNameBySeatSuffix: t('newGame.playerNameBySeatSuffix'),
              playerOrderPrefix: t('newGame.playerOrderPrefix'),
              playerOrderSuffix: t('newGame.playerOrderSuffix'),
              autoSeatConfirm: t('newGame.autoSeatConfirm'),
              autoSeatReshuffle: t('newGame.autoSeatReshuffle'),
              autoSeatResult: t('newGame.autoSeatResult'),
              autoSeatResultManualTitle: t('newGame.autoSeatResultManualTitle'),
              autoSeatResultHint: t('newGame.autoSeatResultHint'),
              autoSeatDealerExample: t('newGame.autoSeatDealerExample'),
              manualSeatCaption: t('newGame.manualSeatCaption'),
              startingDealerModeRandom: t('newGame.startingDealerMode.random'),
              startingDealerModeManual: t('newGame.startingDealerMode.manual'),
              autoFlowHint: t('newGame.autoFlowHint'),
              dealerBadge: t('newGame.dealerBadge'),
              syncEnable: syncCooldownLabel,
              syncEnableBusy: translateWithFallback(t, 'newGame.sync.enabling', '建立同步房中...'),
              syncJoinedPlayersTitle: translateWithFallback(t, 'newGame.sync.joinedPlayersTitle', '已加入玩家'),
              syncJoinedPlayersHint: translateWithFallback(
                t,
                'newGame.sync.joinedPlayersHint',
                '其他玩家加入後，會出現在這裡供你安排到座位或留在後備。',
              ),
              syncSelectedPlayerHint: translateWithFallback(
                t,
                'newGame.sync.selectPlayerHint',
                '點選一位已加入玩家，再點東南西北其中一格安排上枱。',
              ),
              syncSelectedPlayerHintWithName: translateWithFallback(
                t,
                'newGame.sync.selectedPlayerHintWithName',
                '已選 {name}，而家可以點東南西北其中一格安排上枱。',
              ),
              syncSeatAssigned: translateWithFallback(t, 'newGame.sync.syncedSeatLabel', '已同步'),
              syncBenchTitle: translateWithFallback(t, 'roomLobby.bench.title', '後備區'),
              syncKeepBench: translateWithFallback(t, 'newGame.sync.keepBench', '留在後備'),
              syncYou: t('roomLobby.member.self'),
              syncHost: t('roomLobby.member.host'),
            }}
            onSeatModeChange={handleSeatModeChange}
            onSetPlayer={handleSetPlayer}
            onSetAutoName={handleSetAutoName}
            onConfirmAutoSeat={handleConfirmAutoSeat}
            onStartingDealerModeChange={handleStartingDealerModeChange}
            onSelectStartingDealer={handleSelectStartingDealer}
            syncEnabled={hasDraftRoom}
            syncBusy={syncBusy}
            syncEnableDisabled={syncCooldownSeconds > 0}
            syncedSeatDisplayNames={syncedSeatDisplayNames}
            joinedSyncPlayers={joinedSyncPlayers.map((player) => ({
              playerId: player.playerId,
              displayName: player.displayName,
              isHost: player.isHost,
              isSelf: player.isSelf,
            }))}
            selectedSyncPlayerId={selectedSyncPlayerId}
            selectedSyncPlayerName={selectedSyncPlayer?.displayName ?? null}
            benchPlayerNames={benchSyncPlayers.map((player) => player.displayName)}
            onEnableSync={() => {
              handleEnableSync().catch((error) => {
                console.error('[NewGame] enable sync failed', error);
              });
            }}
            onSelectSyncPlayer={handleSelectSyncPlayer}
            onAssignSyncPlayerToSeat={(seatIndex) => {
              const seatKey = SEAT_KEYS[seatIndex];
              if (!seatKey) {
                return;
              }
              handleAssignSyncPlayerToSeat(seatKey);
            }}
            onKeepSyncPlayerOnBench={() => {
              if (selectedSyncPlayerId) {
                handleKeepPlayerOnBench(selectedSyncPlayerId);
              }
            }}
            onPlayersErrorLayout={(event) => {
              sectionY.current.playersError = sectionY.current.players + event.nativeEvent.layout.y;
            }}
          />
        </View>
        <TraditionalHkPaytableModal
          visible={stakePaytableVisible}
          rules={stakePaytableRules}
          onClose={() => setStakePaytableVisible(false)}
        />

        {formError ? <AppText style={styles.errorText}>{formError}</AppText> : null}
        </ScrollView>

        <BottomActionBar
          primaryLabel={loading ? screenCopy.primaryActionBusy : screenCopy.primaryAction}
          onPrimaryPress={handlePressCreate}
          disabled={loading || confirmBusy || syncBusy}
          primaryTestID={hasDraftRoom ? 'new-game-start-synced-room' : 'new-game-create-local'}
          primaryAccessibilityLabel={screenCopy.primaryAction}
          topContent={
            hasDraftRoom ? (
              <View style={styles.syncToolbar}>
                <View style={styles.syncToolbarRoomCode}>
                  <AppText style={styles.syncToolbarLabel}>
                    {translateWithFallback(t, 'roomLobby.hostTools.roomCode', '房間代碼')}
                  </AppText>
                  <AppText selectable style={styles.syncToolbarValue}>
                    {draftRoom?.roomId ?? '-'}
                  </AppText>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.syncToolbarActions}
                >
                  {DEBUG_FLAGS.enableSyncTestTools ? (
                    <Pressable
                      onPress={() => {
                        handleAddDebugSyncPlayer().catch((error) => {
                          console.error('[NewGame] add debug sync player failed', error);
                        });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={translateWithFallback(t, 'newGame.sync.debugAddPlayer', '加入虛擬真人玩家')}
                      accessibilityState={{ disabled: syncBusy }}
                      disabled={syncBusy}
                      testID="new-game-debug-add-temporary-player"
                      style={styles.syncToolbarButton}
                    >
                      <AppText style={styles.syncToolbarButtonText}>
                        {translateWithFallback(t, 'newGame.sync.debugAddPlayer', '加入虛擬真人玩家')}
                      </AppText>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      if (draftRoom) navigation.navigate('Profile', { roomId: draftRoom.roomId });
                    }}
                    disabled={draftRoom?.status !== 'open' || syncBusy}
                    style={styles.syncToolbarButton}
                  >
                    <AppText style={styles.syncToolbarButtonText}>
                      {translateWithFallback(t, 'roomLobby.viewProfile', '修改我的名稱')}
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      handleOpenInviteShare().catch((error) => {
                        console.error('[NewGame] share invite failed', error);
                      });
                    }}
                    disabled={draftRoom?.status !== 'open' || syncBusy || inviteBusy}
                    style={styles.syncToolbarButton}
                  >
                    <AppText style={styles.syncToolbarButtonText}>
                      {inviteBusy
                        ? translateWithFallback(t, 'roomLobby.hostTools.inviteLoading', '準備邀請中...')
                        : translateWithFallback(t, 'roomLobby.hostTools.shareInvite', '分享邀請')}
                    </AppText>
                  </Pressable>
                  <Pressable onPress={handleCancelSync} style={styles.syncToolbarButton}>
                    <AppText style={styles.syncToolbarButtonText}>
                      {translateWithFallback(t, 'newGame.sync.cancelConfirmAction', '取消同步')}
                    </AppText>
                  </Pressable>
                </ScrollView>
              </View>
            ) : null
          }
        />

        <CreateConfirmModal
          visible={confirmVisible}
          busy={confirmBusy}
          sections={confirmSections}
          labels={{
            title: screenCopy.confirmTitle,
            subtitle: screenCopy.confirmSubtitle,
            sectionGame: t('newGame.confirmModal.section.game'),
            sectionScoring: t('newGame.confirmModal.section.scoring'),
            sectionPlayers: t('newGame.confirmModal.section.players'),
            backToEdit: t('newGame.confirmModal.action.backToEdit'),
            confirmCreate: screenCopy.confirmAction,
            creating: screenCopy.primaryActionBusy,
          }}
          onClose={() => setConfirmVisible(false)}
          onConfirm={() => {
            handleConfirmCreate().catch((error) => {
              console.error('[NewGame] confirm create failed', error);
            });
          }}
        />
        <HostNameConfirmModal
          visible={hostNameVisible}
          value={hostDisplayName}
          busy={syncBusy}
          error={hostNameError}
          labels={{
            title: translateWithFallback(t, 'newGame.sync.hostNameTitle', '確認你的名稱'),
            message: translateWithFallback(t, 'newGame.sync.hostNameMessage', '其他玩家會用呢個名稱認出你。確認後先會建立同步房。'),
            inputLabel: translateWithFallback(t, 'newGame.sync.hostNameLabel', '房主名稱'),
            placeholder: translateWithFallback(t, 'newGame.sync.hostNamePlaceholder', '輸入 1–10 個字'),
            cancel: translateWithFallback(t, 'common.cancel', '取消'),
            confirm: translateWithFallback(t, 'newGame.sync.hostNameConfirm', '確認並建立房間'),
            confirming: translateWithFallback(t, 'newGame.sync.enabling', '建立同步房中...'),
          }}
          onChange={(value) => {
            setHostDisplayName(value);
            setHostNameError(null);
          }}
          onCancel={() => {
            if (syncBusy) return;
            setHostNameVisible(false);
            setPendingSyncContext(null);
            setHostNameError(null);
          }}
          onConfirm={() => {
            handleConfirmHostName().catch((error) => console.error('[NewGame] host name confirm failed', error));
          }}
        />
        <InviteShareModal
          visible={inviteShareVisible}
          roomTitle={draftRoom?.title ?? ''}
          invite={invite}
          busy={inviteBusy}
          labels={{
            title: translateWithFallback(t, 'roomLobby.hostTools.shareSheetTitle', '分享邀請'),
            subtitle: translateWithFallback(
              t,
              'roomLobby.hostTools.shareSheetSubtitle',
              '掃描 QR Code 或使用連結加入同步房。',
            ),
            qrCodeLabel: translateWithFallback(t, 'roomLobby.hostTools.qrCodeLabel', 'QR Code'),
            roomCodeLabel: translateWithFallback(t, 'roomLobby.hostTools.roomCode', '房間代碼'),
            inviteUrlLabel: translateWithFallback(t, 'roomLobby.hostTools.inviteUrlLabel', '邀請連結'),
            shareAction: translateWithFallback(t, 'roomLobby.hostTools.shareAction', '分享連結'),
            close: translateWithFallback(t, 'roomLobby.hostTools.closeShare', '關閉'),
            loading: translateWithFallback(t, 'roomLobby.hostTools.inviteLoading', '準備邀請中...'),
          }}
          onClose={() => setInviteShareVisible(false)}
          onShare={() => {
            handleShareInvite().catch((error) => console.error('[NewGame] share invite failed', error));
          }}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: GRID.x2,
  },
  headerBlock: {
    marginBottom: GRID.x2,
    gap: 4,
  },
  headerSubtitle: {
    ...typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  syncToolbar: {
    gap: GRID.x1_5,
  },
  syncToolbarRoomCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GRID.x1,
  },
  syncToolbarLabel: {
    ...typography.caption,
    color: theme.colors.textSecondary,
  },
  syncToolbarValue: {
    ...typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  syncToolbarActions: {
    flexDirection: 'row',
    gap: GRID.x1,
    paddingRight: GRID.x1,
  },
  syncToolbarButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: GRID.x1_5,
    paddingVertical: GRID.x1,
    backgroundColor: theme.colors.surface,
  },
  syncToolbarButtonText: {
    ...typography.caption,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  errorText: {
    ...typography.body,
    marginTop: GRID.x1,
    marginBottom: GRID.x2,
    color: theme.colors.danger,
  },
});

export default NewGameStepperScreen;
