import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomActionBar from '../components/BottomActionBar';
import { createGameWithPlayers } from '../db/repo';
import { DEBUG_FLAGS } from '../debug/debugFlags';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { DEFAULT_CURRENCY_CODE, CurrencyCode, formatCurrencyUnit, getCurrencyMeta } from '../models/currency';
import { getDefaultRules, HkGunMode, HkScoringPreset, HkStakePreset, RulesV1, serializeRules, Variant } from '../models/rules';
import { RootStackParamList } from '../navigation/types';
import theme from '../theme/theme';
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
import { clamp, getMinFanError, getStakePresetHintLines, makeId, parseMinFan, shuffle } from './newGameStepper/helpers';
import CreateConfirmModal from './newGameStepper/sections/CreateConfirmModal';
import CurrencySection from './newGameStepper/sections/CurrencySection';
import GameTitleSection from './newGameStepper/sections/GameTitleSection';
import ModeSection from './newGameStepper/sections/ModeSection';
import PlayersSection from './newGameStepper/sections/PlayersSection';
import ScoringSection from './newGameStepper/sections/ScoringSection';
import { ConfirmField, ConfirmSections, InvalidTarget, PreparedCreateContext, SeatMode } from './newGameStepper/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewGameStepper'>;

function NewGameStepperScreen({ navigation }: Props) {
  const { t, language } = useAppLanguage();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [seatMode, setSeatMode] = useState<SeatMode>('manual');
  const [mode, setMode] = useState<Variant>('HK');
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(DEFAULT_CURRENCY_CODE);
  const [hkScoringPreset, setHkScoringPreset] = useState<HkScoringPreset>('traditionalFan');
  const [hkGunMode, setHkGunMode] = useState<HkGunMode>('halfGun');
  const [hkStakePreset, setHkStakePreset] = useState<HkStakePreset>('TWO_FIVE_CHICKEN');
  const [unitPerFan, setUnitPerFan] = useState(1);
  const [unitPerFanInput, setUnitPerFanInput] = useState('1');
  const [unitPerFanTouched, setUnitPerFanTouched] = useState(false);
  const [minFanToWin, setMinFanToWin] = useState(3);
  const [minFanInput, setMinFanInput] = useState('3');
  const [minFanTouched, setMinFanTouched] = useState(false);
  const [capFanEnabled, setCapFanEnabled] = useState(true);
  const [capFan, setCapFan] = useState(10);
  const [capFanInput, setCapFanInput] = useState('10');
  const [capFanTouched, setCapFanTouched] = useState(false);
  const [sampleFan, setSampleFan] = useState(3);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [players, setPlayers] = useState(['', '', '', '']);
  const [autoNames, setAutoNames] = useState(['', '', '', '']);
  const [autoAssigned, setAutoAssigned] = useState<string[] | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<PreparedCreateContext | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);
  const titleInputRef = useRef<TextInput | null>(null);
  const manualPlayerRefs = useRef<Array<TextInput | null>>([]);
  const autoPlayerRefs = useRef<Array<TextInput | null>>([]);
  const minFanInputRef = useRef<TextInput | null>(null);
  const unitPerFanInputRef = useRef<TextInput | null>(null);
  const capFanInputRef = useRef<TextInput | null>(null);
  const sectionY = useRef<{ title: number; scoring: number; players: number }>({ title: 0, scoring: 0, players: 0 });

  const seatLabels = useMemo(() => [t('seat.east'), t('seat.south'), t('seat.west'), t('seat.north')], [t]);
  const showMinFan = mode === 'TW' || (mode === 'HK' && hkScoringPreset === 'traditionalFan');

  const minFanError =
    showMinFan && (minFanTouched || submitAttempted)
      ? getMinFanError(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX, t('newGame.minFanValidation'))
      : null;
  const unitPerFanError =
    mode === 'HK' && hkScoringPreset === 'customTable' && (unitPerFanTouched || submitAttempted)
      ? getMinFanError(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX, t('newGame.unitPerFanValidation'))
      : null;
  const capFanError =
    mode === 'HK' &&
    capFanEnabled &&
    (hkScoringPreset === 'traditionalFan' || hkScoringPreset === 'customTable') &&
    (capFanTouched || submitAttempted)
      ? getMinFanError(capFanInput, CAP_FAN_MIN, CAP_FAN_MAX, t('newGame.capFanValidation'))
      : null;

  const minFanForHint = parseMinFan(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX) ?? minFanToWin;
  const capFanForHint = capFanEnabled ? parseMinFan(capFanInput, CAP_FAN_MIN, CAP_FAN_MAX) ?? capFan : null;
  const parsedUnitPerFan = parseMinFan(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
  const previewCapFan = capFanEnabled ? parseMinFan(capFanInput, CAP_FAN_MIN, CAP_FAN_MAX) : null;
  const sampleEffectiveFan = previewCapFan !== null ? Math.min(sampleFan, previewCapFan) : sampleFan;
  const sampleBaseAmount = parsedUnitPerFan !== null ? sampleEffectiveFan * parsedUnitPerFan : null;
  const sampleHalfZimoEach = sampleBaseAmount !== null ? sampleBaseAmount * 2 : null;
  const sampleHalfDiscarder = sampleBaseAmount !== null ? sampleBaseAmount * 2 : null;
  const sampleHalfOthersEach = sampleBaseAmount !== null ? sampleBaseAmount : null;
  const sampleFullZimoEach = sampleBaseAmount !== null ? sampleBaseAmount * 2 : null;
  const sampleFullDiscarder = sampleBaseAmount !== null ? sampleBaseAmount * 4 : null;
  const currencySymbol = getCurrencyMeta(currencyCode).symbol;

  const handleSetPlayer = (index: number, value: string) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setPlayersError(null);
  };

  const handleSetAutoName = (index: number, value: string) => {
    setAutoNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setAutoAssigned(null);
    setPlayersError(null);
  };

  const handleSeatModeChange = (nextMode: SeatMode) => {
    setSeatMode(nextMode);
    setPlayersError(null);
    setSubmitAttempted(false);
  };

  const handleConfirmAutoSeat = () => {
    const trimmed = autoNames.map((name) => name.trim());
    if (trimmed.some((name) => name.length === 0)) {
      setPlayersError(t('newGame.autoSeatRequired'));
      return;
    }
    setAutoAssigned(shuffle(trimmed));
    setPlayersError(null);
  };

  const scrollToY = (y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
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
      setTimeout(() => capFanInputRef.current?.focus(), 120);
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
    if (showMinFan) {
      const parsedMinFan = parseMinFan(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX);
      if (parsedMinFan === null) {
        focusInvalidTarget(invalidTarget ?? { kind: 'minFan' });
        return null;
      }
      resolvedMinFan = parsedMinFan;
      setMinFanToWin(parsedMinFan);
    }

    let resolvedUnitPerFan = unitPerFan;
    if (mode === 'HK' && hkScoringPreset === 'customTable') {
      const validatedUnitPerFan = parseMinFan(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
      if (validatedUnitPerFan === null) {
        focusInvalidTarget(invalidTarget ?? { kind: 'unitPerFan' });
        return null;
      }
      resolvedUnitPerFan = validatedUnitPerFan;
      setUnitPerFan(validatedUnitPerFan);
    }

    let resolvedPlayers = [...players];
    if (seatMode === 'manual') {
      resolvedPlayers = resolvedPlayers.map((name) => name.trim());
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
      const trimmed = autoNames.map((name) => name.trim());
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
              : `${missingOrderPlayers.slice(0, -1).join('、')}及${missingOrderPlayers[missingOrderPlayers.length - 1]}`;
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
      }
    }

    setTitleError(nextTitleError);
    setPlayersError(nextPlayersError);
    if (nextTitleError || nextPlayersError) {
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
      ...getDefaultRules(mode),
      variant: mode,
      mode,
      languageDefault: language,
      currencyCode,
      currencySymbol: getCurrencyMeta(currencyCode).symbol,
    };

    if (mode === 'HK') {
      let parsedCapFan: number | null = null;
      if (capFanEnabled) {
        const validatedCapFan = parseMinFan(capFanInput, CAP_FAN_MIN, CAP_FAN_MAX);
        if (validatedCapFan === null) {
          focusInvalidTarget({ kind: 'capFan' });
          return null;
        }
        parsedCapFan = validatedCapFan;
        setCapFan(validatedCapFan);
      }

      const hkBase = rules.hk ?? getDefaultRules('HK').hk!;
      rules.hk = {
        ...hkBase,
        scoringPreset: hkScoringPreset,
        gunMode: hkGunMode,
        stakePreset: hkStakePreset,
        unitPerFan: resolvedUnitPerFan,
        capFan: parsedCapFan,
      };
      rules.minFanToWin = hkScoringPreset === 'traditionalFan' ? resolvedMinFan : rules.minFanToWin ?? 3;
    }

    if (mode === 'TW') {
      rules.minFanToWin = resolvedMinFan;
    }

    if (mode === 'PMA') {
      rules.minFanToWin = undefined;
      rules.pma = { pricingMode: 'directAmount' };
    }

    return { gameId, trimmedTitle, resolvedPlayers, playerInputs, rules };
  };

  const executeCreateGame = async (context: PreparedCreateContext): Promise<boolean> => {
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
          languageOverride: null,
        },
        context.playerInputs,
      );
      navigation.replace('GameDashboard', { gameId: context.gameId });
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
    const modeLabel = context.rules.mode === 'HK' ? t('newGame.mode.hk') : context.rules.mode === 'TW' ? t('newGame.mode.tw') : t('newGame.mode.pma');

    const gameFields: ConfirmField[] = [
      { label: t('newGame.confirmModal.field.title'), value: context.trimmedTitle },
      { label: t('newGame.confirmModal.field.mode'), value: modeLabel },
      { label: t('newGame.confirmModal.field.currency'), value: formatCurrencyUnit(context.rules.currencyCode) },
    ];

    const scoringFields: ConfirmField[] = [];

    if (context.rules.mode === 'HK' && context.rules.hk) {
      scoringFields.push({
        label: t('newGame.confirmModal.field.scoringMethod'),
        value: context.rules.hk.scoringPreset === 'customTable' ? t('newGame.hkPreset.custom') : t('newGame.hkPreset.traditional'),
      });
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
      scoringFields.push({
        label: t('newGame.confirmModal.field.capFan'),
        value: context.rules.hk.capFan === null ? t('newGame.capMode.none') : `${t('newGame.capMode.fanCap')} ${context.rules.hk.capFan}`,
      });
      if (context.rules.hk.scoringPreset === 'customTable') {
        scoringFields.push({ label: t('newGame.confirmModal.field.unitPerFan'), value: String(context.rules.hk.unitPerFan ?? 1) });
      } else {
        scoringFields.push({ label: t('newGame.confirmModal.field.minFan'), value: String(context.rules.minFanToWin ?? minFanToWin) });
      }
    }

    if (context.rules.mode === 'TW') {
      scoringFields.push({ label: t('newGame.confirmModal.field.twMinFan'), value: String(context.rules.minFanToWin ?? minFanToWin) });
    }

    if (context.rules.mode === 'PMA') {
      scoringFields.push({ label: t('newGame.confirmModal.field.pmaMode'), value: t('newGame.pmaDescription') });
    }

    const playerLabels: TranslationKey[] = [
      'newGame.confirmModal.field.playersEast',
      'newGame.confirmModal.field.playersSouth',
      'newGame.confirmModal.field.playersWest',
      'newGame.confirmModal.field.playersNorth',
    ];
    const playerFields: ConfirmField[] = context.resolvedPlayers.map((player, index) => ({ label: t(playerLabels[index]), value: player }));

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
    const next = clamp(minFanToWin + delta, MIN_FAN_MIN, MIN_FAN_MAX);
    setMinFanToWin(next);
    setMinFanInput(String(next));
    setMinFanTouched(true);
  };

  const adjustCapFan = (delta: number) => {
    const next = clamp(capFan + delta, CAP_FAN_MIN, CAP_FAN_MAX);
    setCapFan(next);
    setCapFanInput(String(next));
    setCapFanTouched(true);
  };

  const adjustUnitPerFan = (delta: number) => {
    const next = clamp(unitPerFan + delta, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
    setUnitPerFan(next);
    setUnitPerFanInput(String(next));
    setUnitPerFanTouched(true);
  };

  const adjustSampleFan = (delta: number) => {
    const next = clamp(sampleFan + delta, SAMPLE_FAN_MIN, SAMPLE_FAN_MAX);
    setSampleFan(next);
  };

  const confirmSections = pendingPayload ? buildConfirmSections(pendingPayload) : null;
  const scoringHintLines = getStakePresetHintLines(hkStakePreset, hkGunMode, minFanForHint, capFanForHint, currencySymbol, t);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, GRID.x2) + 64 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.pageTitle}>{t('newGame.title')}</Text>

        <View
          onLayout={(event) => {
            sectionY.current.title = event.nativeEvent.layout.y;
          }}
        >
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
          />
        </View>

        <ModeSection
          title={t('newGame.modeTitle')}
          value={mode}
          onChange={setMode}
          disabled={loading}
          labels={{ hk: t('newGame.mode.hk'), tw: t('newGame.mode.tw'), pma: t('newGame.mode.pma') }}
        />

        <CurrencySection
          title={t('newGame.currencyTitle')}
          value={currencyCode}
          onChange={setCurrencyCode}
          disabled={loading}
          labels={{ hkd: t('currency.hkd'), twd: t('currency.twd'), cny: t('currency.cny') }}
          helperText={`${t('newGame.currencySelectedPrefix')}${formatCurrencyUnit(currencyCode)}`}
        />

        <View
          onLayout={(event) => {
            sectionY.current.scoring = event.nativeEvent.layout.y;
          }}
        >
          <ScoringSection
            mode={mode}
            hkScoringPreset={hkScoringPreset}
            hkGunMode={hkGunMode}
            hkStakePreset={hkStakePreset}
            capFanEnabled={capFanEnabled}
            minFanInput={minFanInput}
            unitPerFanInput={unitPerFanInput}
            capFanInput={capFanInput}
            sampleFan={sampleFan}
            minFanError={minFanError}
            unitPerFanError={unitPerFanError}
            capFanError={capFanError}
            minFanForHint={minFanForHint}
            currencySymbol={currencySymbol}
            sampleBaseAmount={sampleBaseAmount}
            sampleEffectiveFan={sampleEffectiveFan}
            sampleHalfZimoEach={sampleHalfZimoEach}
            sampleHalfDiscarder={sampleHalfDiscarder}
            sampleHalfOthersEach={sampleHalfOthersEach}
            sampleFullZimoEach={sampleFullZimoEach}
            sampleFullDiscarder={sampleFullDiscarder}
            capFanForHint={capFanForHint}
            disabled={loading}
            minFanInputRef={minFanInputRef}
            unitPerFanInputRef={unitPerFanInputRef}
            capFanInputRef={capFanInputRef}
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
              hkStakeBasePrefix: t('newGame.hkStakePreset.baseFromMinFanPrefix'),
              hkStakeBaseSuffix: t('newGame.hkStakePreset.baseFromMinFanSuffix'),
              minFanThresholdLabel: t('newGame.minFanThresholdLabel'),
              hkThresholdHelp: t('newGame.hkThresholdHelp'),
              unitPerFanLabel: t('newGame.unitPerFanLabel'),
              unitPerFanHelp: t('newGame.unitPerFanHelp'),
              capModeLabel: t('newGame.capModeLabel'),
              capModeNone: t('newGame.capMode.none'),
              capModeFanCap: t('newGame.capMode.fanCap'),
              capFanLabel: t('newGame.capFanLabel'),
              capFanHelp: t('newGame.capFanHelp'),
              capFanDisabledHelp: t('newGame.capFanDisabledHelp'),
              sampleFanLabel: t('newGame.sampleFanLabel'),
              realtimeEffectiveFan: t('newGame.realtime.effectiveFan'),
              realtimeHalfGun: t('newGame.realtime.halfGun'),
              realtimeFullGun: t('newGame.realtime.fullGun'),
              twThresholdHelp: t('newGame.twThresholdHelp'),
              pmaDescription: t('newGame.pmaDescription'),
            }}
            stakePresetHintLines={scoringHintLines}
            onHkScoringPresetChange={setHkScoringPreset}
            onHkGunModeChange={setHkGunMode}
            onHkStakePresetChange={setHkStakePreset}
            onCapModeChange={(next) => {
              if (next === 'none') {
                setCapFanEnabled(false);
                setCapFanTouched(false);
              } else {
                setCapFanEnabled(true);
              }
            }}
            onMinFanInputChange={(value) => setMinFanInput(value.replace(/[^0-9]/g, ''))}
            onMinFanBlur={() => {
              setMinFanTouched(true);
              const parsed = parseMinFan(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX);
              if (parsed !== null) {
                setMinFanToWin(parsed);
                setMinFanInput(String(parsed));
              }
            }}
            onMinFanIncrement={() => adjustMinFan(1)}
            onMinFanDecrement={() => adjustMinFan(-1)}
            onUnitPerFanInputChange={(value) => setUnitPerFanInput(value.replace(/[^0-9]/g, ''))}
            onUnitPerFanBlur={() => {
              setUnitPerFanTouched(true);
              const parsed = parseMinFan(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
              if (parsed !== null) {
                setUnitPerFan(parsed);
                setUnitPerFanInput(String(parsed));
              }
            }}
            onUnitPerFanIncrement={() => adjustUnitPerFan(1)}
            onUnitPerFanDecrement={() => adjustUnitPerFan(-1)}
            onCapFanInputChange={(value) => setCapFanInput(value.replace(/[^0-9]/g, ''))}
            onCapFanBlur={() => {
              setCapFanTouched(true);
              const parsed = parseMinFan(capFanInput, CAP_FAN_MIN, CAP_FAN_MAX);
              if (parsed !== null) {
                setCapFan(parsed);
                setCapFanInput(String(parsed));
              }
            }}
            onCapFanIncrement={() => adjustCapFan(1)}
            onCapFanDecrement={() => adjustCapFan(-1)}
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
            }}
            onSeatModeChange={handleSeatModeChange}
            onSetPlayer={handleSetPlayer}
            onSetAutoName={handleSetAutoName}
            onConfirmAutoSeat={handleConfirmAutoSeat}
          />
        </View>

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        {DEBUG_FLAGS.enableScrollSpacer ? <View style={styles.debugSpacer} /> : null}
      </ScrollView>

      <BottomActionBar
        primaryLabel={loading ? t('newGame.creating') : t('newGame.create')}
        onPrimaryPress={handlePressCreate}
        secondaryLabel={t('common.back')}
        onSecondaryPress={() => navigation.goBack()}
        disabled={loading || confirmBusy}
      />

      <CreateConfirmModal
        visible={confirmVisible}
        busy={confirmBusy}
        sections={confirmSections}
        labels={{
          title: t('newGame.confirmModal.title'),
          subtitle: t('newGame.confirmModal.subtitle'),
          sectionGame: t('newGame.confirmModal.section.game'),
          sectionScoring: t('newGame.confirmModal.section.scoring'),
          sectionPlayers: t('newGame.confirmModal.section.players'),
          backToEdit: t('newGame.confirmModal.action.backToEdit'),
          confirmCreate: t('newGame.confirmModal.action.confirmCreate'),
          creating: t('newGame.creating'),
        }}
        onClose={() => setConfirmVisible(false)}
        onConfirm={() => {
          handleConfirmCreate().catch((error) => {
            console.error('[NewGame] confirm create failed', error);
          });
        }}
      />
    </KeyboardAvoidingView>
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
    paddingTop: GRID.x3,
  },
  pageTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: GRID.x2,
  },
  errorText: {
    marginTop: GRID.x1,
    marginBottom: GRID.x2,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  debugSpacer: {
    height: 800,
  },
});

export default NewGameStepperScreen;
