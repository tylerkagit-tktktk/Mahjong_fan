import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import Card from '../components/Card';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { createGameWithPlayers } from '../db/repo';
import {
  getDefaultRules,
  HkGunMode,
  HkScoringPreset,
  HkStakePreset,
  RulesV1,
  serializeRules,
  Variant,
} from '../models/rules';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { TranslationKey } from '../i18n/types';
import { DEBUG_FLAGS } from '../debug/debugFlags';

type Props = NativeStackScreenProps<RootStackParamList, 'NewGameStepper'>;
type SeatMode = 'manual' | 'auto';
const PLAYER_COUNT = 4;

const GRID = {
  x1: 8,
  x1_5: 12,
  x2: 16,
  x3: 24,
} as const;
const HIT_SLOP = { top: GRID.x1, right: GRID.x1, bottom: GRID.x1, left: GRID.x1 } as const;

const MIN_FAN_MIN = 0;
const MIN_FAN_MAX = 13;
const UNIT_PER_FAN_MIN = 1;
const UNIT_PER_FAN_MAX = 9999;
const CAP_FAN_MIN = 1;
const CAP_FAN_MAX = 20;

function NewGameStepperScreen({ navigation }: Props) {
  const { t, language } = useAppLanguage();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [seatMode, setSeatMode] = useState<SeatMode>('manual');
  const [mode, setMode] = useState<Variant>('HK');
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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [players, setPlayers] = useState(['', '', '', '']);
  const [autoNames, setAutoNames] = useState(['', '', '', '']);
  const [autoAssigned, setAutoAssigned] = useState<string[] | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const seatLabels = useMemo(
    () => [t('seat.east'), t('seat.south'), t('seat.west'), t('seat.north')],
    [t],
  );

  const showMinFan = mode === 'TW' || (mode === 'HK' && hkScoringPreset === 'traditionalFan');

  const minFanError =
    showMinFan && (minFanTouched || submitAttempted)
      ? getMinFanError(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX, t('newGame.minFanValidation'))
      : null;
  const unitPerFanError =
    mode === 'HK' && hkScoringPreset === 'customTable' && (unitPerFanTouched || submitAttempted)
      ? getMinFanError(
          unitPerFanInput,
          UNIT_PER_FAN_MIN,
          UNIT_PER_FAN_MAX,
          t('newGame.unitPerFanValidation'),
        )
      : null;
  const capFanError =
    mode === 'HK' &&
    capFanEnabled &&
    (hkScoringPreset === 'traditionalFan' || hkScoringPreset === 'customTable') &&
    (capFanTouched || submitAttempted)
      ? getMinFanError(capFanInput, CAP_FAN_MIN, CAP_FAN_MAX, t('newGame.capFanValidation'))
      : null;
  const minFanForHint = parseMinFan(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX) ?? minFanToWin;
  const capFanForHint = capFanEnabled
    ? parseMinFan(capFanInput, CAP_FAN_MIN, CAP_FAN_MAX) ?? capFan
    : null;
  const titleRequiredMessage = t('newGame.requiredTitle');

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

  const confirmAutoSeat = () => {
    const trimmed = autoNames.map((name) => name.trim());
    if (trimmed.some((name) => name.length === 0)) {
      setPlayersError(t('newGame.autoSeatRequired'));
      return;
    }
    const shuffled = shuffle(trimmed);
    setAutoAssigned(shuffled);
    setPlayersError(null);
  };

  const handleCreate = async () => {
    setFormError(null);
    setSubmitAttempted(true);
    if (loading) {
      return;
    }
    const trimmedTitle = title.trim();
    let nextTitleError: string | null = null;
    let nextPlayersError: string | null = null;
    if (!trimmedTitle) {
      nextTitleError = titleRequiredMessage;
    }

    let resolvedMinFan = minFanToWin;
    if (showMinFan) {
      const parsedMinFan = parseMinFan(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX);
      if (parsedMinFan === null) {
        return;
      }
      resolvedMinFan = parsedMinFan;
      setMinFanToWin(parsedMinFan);
    }
    let resolvedUnitPerFan = unitPerFan;
    if (mode === 'HK' && hkScoringPreset === 'customTable') {
      const parsedUnitPerFan = parseMinFan(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
      if (parsedUnitPerFan === null) {
        return;
      }
      resolvedUnitPerFan = parsedUnitPerFan;
      setUnitPerFan(parsedUnitPerFan);
    }

    let resolvedPlayers = [...players];
    if (seatMode === 'manual') {
      resolvedPlayers = resolvedPlayers.map((name) => name.trim());
      const missingIndexes = resolvedPlayers
        .map((name, index) => (name.length === 0 ? index : -1))
        .filter((index) => index >= 0);
      if (missingIndexes.length > 0) {
        if (missingIndexes.length === PLAYER_COUNT) {
          nextPlayersError = t('newGame.requiredPlayersAll');
        } else {
          const missingSeats = missingIndexes.map((index) => `${seatLabels[index]}${t('newGame.playerSeatSuffix')}`);
          nextPlayersError = `${t('newGame.requiredPlayersListPrefix')}${missingSeats.join('，')}${t('newGame.requiredPlayersListSuffix')}`;
        }
      }
    } else {
      const trimmed = autoNames.map((name) => name.trim());
      const missingIndexes = trimmed
        .map((name, index) => (name.length === 0 ? index : -1))
        .filter((index) => index >= 0);
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
      } else if (!autoAssigned) {
        nextPlayersError = t('newGame.autoSeatNeedConfirm');
      } else {
        resolvedPlayers = [...autoAssigned];
      }
    }

    setTitleError(nextTitleError);
    setPlayersError(nextPlayersError);
    if (nextTitleError || nextPlayersError) {
      return;
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
      currencySymbol: '$',
    };

    if (mode === 'HK') {
      let parsedCapFan: number | null = null;
      if (capFanEnabled) {
        const value = parseMinFan(capFanInput, CAP_FAN_MIN, CAP_FAN_MAX);
        if (value === null) {
          return;
        }
        parsedCapFan = value;
        setCapFan(value);
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

    try {
      setLoading(true);
      await createGameWithPlayers(
        {
          id: gameId,
          title: trimmedTitle,
          createdAt: Date.now(),
          currencySymbol: rules.currencySymbol,
          variant: rules.variant,
          rulesJson: serializeRules(rules),
          languageOverride: null,
        },
        playerInputs,
      );
      navigation.replace('GameDashboard', { gameId });
    } catch (err) {
      console.error('[DB] createGame failed', err);
      setFormError(t('errors.createGame'));
    } finally {
      setLoading(false);
    }
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, GRID.x2) + 64 },
        ]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.pageTitle}>{t('newGame.title')}</Text>

        <Card style={styles.card}>
          <TextField
            label={t('newGame.gameTitle')}
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setTitleError(null);
            }}
            placeholder={t('newGame.gameTitlePlaceholder')}
          />
          {titleError ? <Text style={styles.inlineErrorText}>{titleError}</Text> : null}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('newGame.modeTitle')}</Text>
          <View style={styles.segmentedRow}>
            <Pressable
              style={[styles.segmentedButton, styles.segmentedButtonSpacing, mode === 'HK' && styles.segmentedButtonActive]}
              onPress={() => setMode('HK')}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, selected: mode === 'HK' }}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.segmentedText, mode === 'HK' && styles.segmentedTextActive]}>{t('newGame.mode.hk')}</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentedButton, styles.segmentedButtonSpacing, mode === 'TW' && styles.segmentedButtonActive]}
              onPress={() => setMode('TW')}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, selected: mode === 'TW' }}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.segmentedText, mode === 'TW' && styles.segmentedTextActive]}>{t('newGame.mode.tw')}</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentedButton, mode === 'PMA' && styles.segmentedButtonActive]}
              onPress={() => setMode('PMA')}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, selected: mode === 'PMA' }}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.segmentedText, mode === 'PMA' && styles.segmentedTextActive]}>{t('newGame.mode.pma')}</Text>
            </Pressable>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('newGame.scoringMethod')}</Text>

          {mode === 'HK' ? (
            <>
              <View style={styles.segmentedRow}>
                <Pressable
                  style={[styles.segmentedButton, styles.segmentedButtonSpacing, hkScoringPreset === 'traditionalFan' && styles.segmentedButtonActive]}
                  onPress={() => setHkScoringPreset('traditionalFan')}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: loading, selected: hkScoringPreset === 'traditionalFan' }}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={[styles.segmentedText, hkScoringPreset === 'traditionalFan' && styles.segmentedTextActive]}>
                    {t('newGame.hkPreset.traditional')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.segmentedButton, hkScoringPreset === 'customTable' && styles.segmentedButtonActive]}
                  onPress={() => setHkScoringPreset('customTable')}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: loading, selected: hkScoringPreset === 'customTable' }}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={[styles.segmentedText, hkScoringPreset === 'customTable' && styles.segmentedTextActive]}>
                    {t('newGame.hkPreset.custom')}
                  </Text>
                </Pressable>
              </View>

              {hkScoringPreset === 'traditionalFan' ? (
                <View style={styles.blockSpacing}>
                  <Text style={styles.inputLabel}>{t('newGame.hkGunModeLabel')}</Text>
                  <View style={styles.segmentedRow}>
                    <Pressable
                      style={[
                        styles.segmentedButton,
                        styles.segmentedButtonSpacing,
                        hkGunMode === 'halfGun' && styles.segmentedButtonActive,
                      ]}
                      onPress={() => setHkGunMode('halfGun')}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: loading, selected: hkGunMode === 'halfGun' }}
                      hitSlop={HIT_SLOP}
                    >
                      <Text style={[styles.segmentedText, hkGunMode === 'halfGun' && styles.segmentedTextActive]}>
                        {t('newGame.hkGunMode.half')}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.segmentedButton, hkGunMode === 'fullGun' && styles.segmentedButtonActive]}
                      onPress={() => setHkGunMode('fullGun')}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: loading, selected: hkGunMode === 'fullGun' }}
                      hitSlop={HIT_SLOP}
                    >
                      <Text style={[styles.segmentedText, hkGunMode === 'fullGun' && styles.segmentedTextActive]}>
                        {t('newGame.hkGunMode.full')}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.blockSpacing}>
                    <Text style={styles.inputLabel}>{t('newGame.hkStakePresetLabel')}</Text>
                    <View style={styles.segmentedRow}>
                      <Pressable
                        style={[
                          styles.segmentedButton,
                          styles.segmentedButtonSpacing,
                          hkStakePreset === 'TWO_FIVE_CHICKEN' && styles.segmentedButtonActive,
                        ]}
                        onPress={() => setHkStakePreset('TWO_FIVE_CHICKEN')}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled: loading,
                          selected: hkStakePreset === 'TWO_FIVE_CHICKEN',
                        }}
                        hitSlop={HIT_SLOP}
                      >
                        <Text
                          style={[
                            styles.segmentedText,
                            hkStakePreset === 'TWO_FIVE_CHICKEN' && styles.segmentedTextActive,
                          ]}
                        >
                          {t('newGame.hkStakePreset.twoFiveChicken')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.segmentedButton,
                          styles.segmentedButtonSpacing,
                          hkStakePreset === 'FIVE_ONE' && styles.segmentedButtonActive,
                        ]}
                        onPress={() => setHkStakePreset('FIVE_ONE')}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled: loading,
                          selected: hkStakePreset === 'FIVE_ONE',
                        }}
                        hitSlop={HIT_SLOP}
                      >
                        <Text
                          style={[
                            styles.segmentedText,
                            hkStakePreset === 'FIVE_ONE' && styles.segmentedTextActive,
                          ]}
                        >
                          {t('newGame.hkStakePreset.fiveOne')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.segmentedButton,
                          hkStakePreset === 'ONE_TWO' && styles.segmentedButtonActive,
                        ]}
                        onPress={() => setHkStakePreset('ONE_TWO')}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: loading, selected: hkStakePreset === 'ONE_TWO' }}
                        hitSlop={HIT_SLOP}
                      >
                        <Text
                          style={[
                            styles.segmentedText,
                            hkStakePreset === 'ONE_TWO' && styles.segmentedTextActive,
                          ]}
                        >
                          {t('newGame.hkStakePreset.oneTwo')}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.helperText}>
                      {`${t('newGame.hkStakePreset.baseFromMinFanPrefix')}${minFanForHint}${t('newGame.hkStakePreset.baseFromMinFanSuffix')}`}
                    </Text>
                    {getStakePresetHintLines(
                      hkStakePreset,
                      hkGunMode,
                      minFanForHint,
                      capFanForHint,
                      t,
                    ).map((line, index) => (
                      <Text
                        key={`${hkStakePreset}-${hkGunMode}-${index}`}
                        style={index === 0 ? styles.helperText : styles.helperTextSubLine}
                      >
                        {line}
                      </Text>
                    ))}
                  </View>

                  <View style={styles.blockSpacing}>
                    <Text style={styles.inputLabel}>{t('newGame.minFanThresholdLabel')}</Text>
                    <View style={styles.minFanRow}>
                      <Pressable
                        style={[styles.adjustButton, styles.adjustButtonLeft]}
                        onPress={() => adjustMinFan(-1)}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: loading }}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={styles.adjustText}>-</Text>
                      </Pressable>
                      <TextInput
                        style={[styles.minFanInput, minFanError ? styles.minFanInputError : null]}
                        keyboardType="number-pad"
                        value={minFanInput}
                        onChangeText={(value) => setMinFanInput(value.replace(/[^0-9]/g, ''))}
                        onBlur={() => {
                          setMinFanTouched(true);
                          const parsed = parseMinFan(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX);
                          if (parsed !== null) {
                            setMinFanToWin(parsed);
                            setMinFanInput(String(parsed));
                          }
                        }}
                        placeholder={`${MIN_FAN_MIN}-${MIN_FAN_MAX}`}
                        placeholderTextColor={theme.colors.textSecondary}
                        editable={!loading}
                      />
                      <Pressable
                        style={[styles.adjustButton, styles.adjustButtonRight]}
                        onPress={() => adjustMinFan(1)}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: loading }}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={styles.adjustText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.helperText}>{t('newGame.hkThresholdHelp')}</Text>
                  {minFanError ? <Text style={styles.inlineErrorText}>{minFanError}</Text> : null}

                </View>
              ) : (
                <View style={styles.blockSpacing}>
                  <Text style={styles.inputLabel}>{t('newGame.unitPerFanLabel')}</Text>
                  <View style={styles.minFanRow}>
                    <Pressable
                      style={[styles.adjustButton, styles.adjustButtonLeft]}
                      onPress={() => adjustUnitPerFan(-1)}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: loading }}
                      hitSlop={HIT_SLOP}
                    >
                      <Text style={styles.adjustText}>-</Text>
                    </Pressable>
                    <TextInput
                      style={[styles.minFanInput, unitPerFanError ? styles.minFanInputError : null]}
                      keyboardType="number-pad"
                      value={unitPerFanInput}
                      onChangeText={(value) => setUnitPerFanInput(value.replace(/[^0-9]/g, ''))}
                      onBlur={() => {
                        setUnitPerFanTouched(true);
                        const parsed = parseMinFan(unitPerFanInput, UNIT_PER_FAN_MIN, UNIT_PER_FAN_MAX);
                        if (parsed !== null) {
                          setUnitPerFan(parsed);
                          setUnitPerFanInput(String(parsed));
                        }
                      }}
                      placeholder={`${UNIT_PER_FAN_MIN}-${UNIT_PER_FAN_MAX}`}
                      placeholderTextColor={theme.colors.textSecondary}
                      editable={!loading}
                    />
                    <Pressable
                      style={[styles.adjustButton, styles.adjustButtonRight]}
                      onPress={() => adjustUnitPerFan(1)}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: loading }}
                      hitSlop={HIT_SLOP}
                    >
                      <Text style={styles.adjustText}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.helperText}>{t('newGame.unitPerFanHelp')}</Text>
                  {unitPerFanError ? <Text style={styles.inlineErrorText}>{unitPerFanError}</Text> : null}
                </View>
              )}

              <View style={styles.blockSpacing}>
                <Text style={styles.inputLabel}>{t('newGame.capModeLabel')}</Text>
                <View style={styles.segmentedRow}>
                  <Pressable
                    style={[
                      styles.segmentedButton,
                      styles.segmentedButtonSpacing,
                      !capFanEnabled && styles.segmentedButtonActive,
                    ]}
                    onPress={() => {
                      setCapFanEnabled(false);
                      setCapFanTouched(false);
                    }}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: loading, selected: !capFanEnabled }}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={[styles.segmentedText, !capFanEnabled && styles.segmentedTextActive]}>
                      {t('newGame.capMode.none')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.segmentedButton, capFanEnabled && styles.segmentedButtonActive]}
                    onPress={() => setCapFanEnabled(true)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: loading, selected: capFanEnabled }}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={[styles.segmentedText, capFanEnabled && styles.segmentedTextActive]}>
                      {t('newGame.capMode.fanCap')}
                    </Text>
                  </Pressable>
                </View>
                {capFanEnabled ? (
                  <>
                    <View style={styles.blockSpacing}>
                      <Text style={styles.inputLabel}>{t('newGame.capFanLabel')}</Text>
                      <View style={styles.minFanRow}>
                        <Pressable
                          style={[styles.adjustButton, styles.adjustButtonLeft]}
                          onPress={() => adjustCapFan(-1)}
                          disabled={loading}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: loading }}
                          hitSlop={HIT_SLOP}
                        >
                          <Text style={styles.adjustText}>-</Text>
                        </Pressable>
                        <TextInput
                          style={[styles.minFanInput, capFanError ? styles.minFanInputError : null]}
                          keyboardType="number-pad"
                          value={capFanInput}
                          onChangeText={(value) => setCapFanInput(value.replace(/[^0-9]/g, ''))}
                          onBlur={() => {
                            setCapFanTouched(true);
                            const parsed = parseMinFan(capFanInput, CAP_FAN_MIN, CAP_FAN_MAX);
                            if (parsed !== null) {
                              setCapFan(parsed);
                              setCapFanInput(String(parsed));
                            }
                          }}
                          placeholder={`${CAP_FAN_MIN}-${CAP_FAN_MAX}`}
                          placeholderTextColor={theme.colors.textSecondary}
                          editable={!loading}
                        />
                        <Pressable
                          style={[styles.adjustButton, styles.adjustButtonRight]}
                          onPress={() => adjustCapFan(1)}
                          disabled={loading}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: loading }}
                          hitSlop={HIT_SLOP}
                        >
                          <Text style={styles.adjustText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.helperText}>{t('newGame.capFanHelp')}</Text>
                    {capFanError ? <Text style={styles.inlineErrorText}>{capFanError}</Text> : null}
                  </>
                ) : (
                  <Text style={styles.helperText}>{t('newGame.capFanDisabledHelp')}</Text>
                )}
              </View>
            </>
          ) : null}

          {mode === 'TW' ? (
            <View style={styles.blockSpacing}>
              <Text style={styles.inputLabel}>{t('newGame.minFanThresholdLabel')}</Text>
              <View style={styles.minFanRow}>
                <Pressable
                  style={[styles.adjustButton, styles.adjustButtonLeft]}
                  onPress={() => adjustMinFan(-1)}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: loading }}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.adjustText}>-</Text>
                </Pressable>
                <TextInput
                  style={[styles.minFanInput, minFanError ? styles.minFanInputError : null]}
                  keyboardType="number-pad"
                  value={minFanInput}
                  onChangeText={(value) => setMinFanInput(value.replace(/[^0-9]/g, ''))}
                  onBlur={() => {
                    setMinFanTouched(true);
                    const parsed = parseMinFan(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX);
                    if (parsed !== null) {
                      setMinFanToWin(parsed);
                      setMinFanInput(String(parsed));
                    }
                  }}
                  placeholder={`${MIN_FAN_MIN}-${MIN_FAN_MAX}`}
                  placeholderTextColor={theme.colors.textSecondary}
                  editable={!loading}
                />
                <Pressable
                  style={[styles.adjustButton, styles.adjustButtonRight]}
                  onPress={() => adjustMinFan(1)}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: loading }}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.adjustText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.helperText}>{t('newGame.twThresholdHelp')}</Text>
              {minFanError ? <Text style={styles.inlineErrorText}>{minFanError}</Text> : null}
            </View>
          ) : null}

          {mode === 'PMA' ? <Text style={styles.helperText}>{t('newGame.pmaDescription')}</Text> : null}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('newGame.players')}</Text>

          <Text style={styles.inputLabel}>{t('newGame.seatModeTitle')}</Text>
          <View style={styles.segmentedRow}>
            <Pressable
              style={[
                styles.segmentedButton,
                styles.segmentedButtonSpacing,
                seatMode === 'manual' && styles.segmentedButtonActive,
              ]}
              onPress={() => handleSeatModeChange('manual')}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, selected: seatMode === 'manual' }}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.segmentedText, seatMode === 'manual' && styles.segmentedTextActive]}>
                {t('newGame.seatMode.manual')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentedButton, seatMode === 'auto' && styles.segmentedButtonActive]}
              onPress={() => handleSeatModeChange('auto')}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, selected: seatMode === 'auto' }}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.segmentedText, seatMode === 'auto' && styles.segmentedTextActive]}>
                {t('newGame.seatMode.auto')}
              </Text>
            </Pressable>
          </View>

          {seatMode === 'manual' ? (
            <View style={styles.playersList}>
              <Text style={styles.helperText}>
                {`${t('newGame.playerManualHintPrefix')}${PLAYER_COUNT}${t('newGame.playerManualHintSuffix')}`}
              </Text>
              {seatLabels.map((label, index) => (
                <View key={label} style={styles.playerRowCard}>
                  <View style={styles.seatChip}>
                    <Text style={styles.seatChipText}>{label}</Text>
                  </View>
                  <TextInput
                    style={styles.playerInput}
                    value={players[index]}
                    onChangeText={(value) => handleSetPlayer(index, value)}
                    placeholder={`${label}${t('newGame.playerNameBySeatSuffix')}`}
                    placeholderTextColor={theme.colors.textSecondary}
                    editable={!loading}
                    returnKeyType={index === 3 ? 'done' : 'next'}
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.playersList}>
              <Text style={styles.helperText}>
                {`${t('newGame.playerAutoHintPrefix')}${PLAYER_COUNT}${t('newGame.playerAutoHintSuffix')}`}
              </Text>
              {autoNames.map((value, index) => (
                <View key={`auto-${index}`} style={styles.playerRowCard}>
                  <View style={styles.seatChip}>
                    <Text style={styles.seatChipText}>{index + 1}</Text>
                  </View>
                  <TextInput
                    style={styles.playerInput}
                    value={value}
                    onChangeText={(next) => handleSetAutoName(index, next)}
                    placeholder={`${t('newGame.playerOrderPrefix')}${index + 1}${t('newGame.playerOrderSuffix')}`}
                    placeholderTextColor={theme.colors.textSecondary}
                    editable={!loading}
                    returnKeyType={index === 3 ? 'done' : 'next'}
                  />
                </View>
              ))}

              <AppButton
                label={autoAssigned ? t('newGame.autoSeatReshuffle') : t('newGame.autoSeatConfirm')}
                onPress={confirmAutoSeat}
                disabled={loading}
                variant="secondary"
              />

              {autoAssigned ? (
                <View style={styles.blockSpacing}>
                  <Text style={styles.inputLabel}>{t('newGame.autoSeatResult')}</Text>
                  {seatLabels.map((label, index) => (
                    <View key={`result-${label}`} style={styles.playerRowCard}>
                      <View style={styles.seatChip}>
                        <Text style={styles.seatChipText}>{label}</Text>
                      </View>
                      <Text style={styles.resultText}>{autoAssigned[index]}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )}
          {playersError ? <Text style={styles.inlineErrorText}>{playersError}</Text> : null}
        </Card>

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        {DEBUG_FLAGS.enableScrollSpacer ? <View style={styles.debugSpacer} /> : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, GRID.x2) }]}> 
        <AppButton
          label={loading ? t('newGame.creating') : t('newGame.create')}
          onPress={handleCreate}
          disabled={loading}
        />
        <AppButton
          label={t('common.back')}
          onPress={() => navigation.goBack()}
          disabled={loading}
          variant="secondary"
          style={styles.secondaryAction}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseMinFan(input: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(input)) {
    return null;
  }
  const parsed = Number(input);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  if (parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function getMinFanError(input: string, min: number, max: number, message: string): string | null {
  return parseMinFan(input, min, max) === null ? `${message} (${min}-${max})` : null;
}

function getStakePresetHintLines(
  preset: HkStakePreset,
  gunMode: HkGunMode,
  minFan: number,
  capFan: number | null,
  t: (key: TranslationKey) => string,
): string[] {
  const fanText = String(minFan);
  const capFanText = capFan === null ? t('newGame.capMode.none') : String(capFan);
  const effectiveMinFan = Math.max(1, minFan);
  const effectiveCapFan = capFan === null ? effectiveMinFan : Math.max(1, capFan);
  const startMultiplier = 2 ** (effectiveMinFan - 1);
  const capMultiplier = 2 ** (effectiveCapFan - 1);

  const base = getStakeBase(preset, gunMode);
  const startZimo = base.zimo * startMultiplier;
  const startDiscard = base.discard * startMultiplier;
  const startOthers = base.others !== null ? base.others * startMultiplier : null;
  const capZimo = base.zimo * capMultiplier;
  const capDiscard = base.discard * capMultiplier;
  const capOthers = base.others !== null ? base.others * capMultiplier : null;

  const fill = (template: string) =>
    template
      .replaceAll('{fan}', fanText)
      .replaceAll('{capFan}', capFanText)
      .replaceAll('{startZimo}', formatMoney(startZimo))
      .replaceAll('{startDiscard}', formatMoney(startDiscard))
      .replaceAll('{startOthers}', formatMoney(startOthers ?? 0))
      .replaceAll('{capZimo}', formatMoney(capZimo))
      .replaceAll('{capDiscard}', formatMoney(capDiscard))
      .replaceAll('{capOthers}', formatMoney(capOthers ?? 0));
  if (preset === 'TWO_FIVE_CHICKEN') {
    const template =
      gunMode === 'halfGun'
        ? t('newGame.hkStakePreset.twoFiveChickenHalfHelp')
        : t('newGame.hkStakePreset.twoFiveChickenFullHelp');
    return splitHintLines(fill(template));
  }
  if (preset === 'FIVE_ONE') {
    const template =
      gunMode === 'halfGun'
        ? t('newGame.hkStakePreset.fiveOneHalfHelp')
        : t('newGame.hkStakePreset.fiveOneFullHelp');
    return splitHintLines(fill(template));
  }
  const template =
    gunMode === 'halfGun'
      ? t('newGame.hkStakePreset.oneTwoHalfHelp')
      : t('newGame.hkStakePreset.oneTwoFullHelp');
  return splitHintLines(fill(template));
}

function splitHintLines(hint: string): string[] {
  const parts = hint.split('|').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [hint];
}

function getStakeBase(
  preset: HkStakePreset,
  gunMode: HkGunMode,
): { zimo: number; discard: number; others: number | null } {
  if (preset === 'TWO_FIVE_CHICKEN') {
    return gunMode === 'halfGun'
      ? { zimo: 1, discard: 1, others: 0.5 }
      : { zimo: 1, discard: 2, others: null };
  }
  if (preset === 'FIVE_ONE') {
    return gunMode === 'halfGun'
      ? { zimo: 2, discard: 2, others: 1 }
      : { zimo: 2, discard: 4, others: null };
  }
  return gunMode === 'halfGun'
    ? { zimo: 4, discard: 4, others: 2 }
    : { zimo: 4, discard: 8, others: null };
}

function formatMoney(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function shuffle(values: string[]): string[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
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
  card: {
    marginBottom: GRID.x2,
    padding: GRID.x2,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: GRID.x1_5,
  },
  segmentedRow: {
    flexDirection: 'row',
  },
  segmentedButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: GRID.x1,
  },
  segmentedButtonSpacing: {
    marginRight: GRID.x1,
  },
  segmentedButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E6F5F5',
  },
  segmentedText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  segmentedTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  blockSpacing: {
    marginTop: GRID.x1_5,
  },
  inputLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: GRID.x1,
  },
  minFanRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adjustButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  adjustButtonLeft: {
    marginRight: GRID.x1,
  },
  adjustButtonRight: {
    marginLeft: GRID.x1,
  },
  adjustText: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: theme.fontSize.md,
  },
  minFanInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: GRID.x2,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
  },
  minFanInputError: {
    borderColor: theme.colors.danger,
  },
  helperText: {
    marginTop: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  helperTextSubLine: {
    marginTop: 6,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  inlineErrorText: {
    marginTop: GRID.x1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  comingSoonText: {
    marginTop: GRID.x1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  playersList: {
    marginTop: GRID.x1,
  },
  playerRowCard: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GRID.x1_5,
    marginBottom: GRID.x1_5,
  },
  seatChip: {
    minWidth: 40,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E6F5F5',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: GRID.x1_5,
  },
  seatChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  playerInput: {
    flex: 1,
    minHeight: 44,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  resultText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  errorText: {
    marginTop: GRID.x1,
    marginBottom: GRID.x2,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  actionBar: {
    paddingHorizontal: GRID.x2,
    paddingTop: GRID.x1_5,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  secondaryAction: {
    marginTop: GRID.x1_5,
  },
  debugSpacer: {
    height: 800,
  },
});

export default NewGameStepperScreen;
