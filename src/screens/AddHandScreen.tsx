import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomActionBar from '../components/BottomActionBar';
import TextField from '../components/TextField';
import Card from '../components/Card';
import SegmentedControl from '../components/SegmentedControl';
import PillGroup from '../components/PillGroup';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { getGameBundle, insertHand } from '../db/repo';
import { GameBundle } from '../models/db';
import { parseRules, Variant } from '../models/rules';
import { computeCustomPayout, HkSettlementType } from '../models/hkStakes';
import { getDealerSeatIndexForNextHand } from '../models/dealer';
import { computeHkSettlement, toAmountFromQ } from '../domain/hk/settlement';
import {
  CurrencyCode,
  DEFAULT_CURRENCY_CODE,
  formatCurrencyAmount,
  formatCurrencyUnit,
  inferCurrencyCodeFromSymbol,
  resolveCurrencyCode,
} from '../models/currency';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { dumpBreadcrumbs, setBreadcrumb } from '../debug/breadcrumbs';
import { DEBUG_FLAGS } from '../debug/debugFlags';

type Props = NativeStackScreenProps<RootStackParamList, 'AddHand'>;

const GRID = {
  x1: 8,
  x1_5: 12,
  x2: 16,
  x3: 24,
} as const;

function AddHandScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { t } = useAppLanguage();

  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [hkScoringPreset, setHkScoringPreset] = useState<'traditionalFan' | 'customTable'>(
    'traditionalFan',
  );
  const [hkGunMode, setHkGunMode] = useState<'halfGun' | 'fullGun'>('halfGun');
  const [unitPerFan, setUnitPerFan] = useState(1);
  const [capFan, setCapFan] = useState<number | null>(null);
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(DEFAULT_CURRENCY_CODE);
  const [mode, setMode] = useState<Variant>('HK');
  const [handType, setHandType] = useState<'normal' | 'draw' | 'bonus'>('normal');
  const [inputValue, setInputValue] = useState('');
  const [settlementType, setSettlementType] = useState<HkSettlementType>('zimo');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [discarderId, setDiscarderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isPma = mode === 'PMA';
  const isHkCustom = mode === 'HK' && hkScoringPreset === 'customTable';
  const invalidFanError = t('errors.invalidFan');
  const selectWinnerError = t('errors.selectWinner');
  const selectDiscarderError = t('errors.selectDiscarder');
  const discarderCannotBeWinnerError = t('errors.discarderCannotBeWinner');
  const showFanInlineError = error === invalidFanError;
  const showWinnerInlineError = error === selectWinnerError;
  const showDiscarderInlineError =
    error === selectDiscarderError || error === discarderCannotBeWinnerError;

  const inputLabel = isPma
    ? t('addHand.inputAmount')
    : isHkCustom
    ? t('addHand.inputFan')
    : t('addHand.inputValue');
  const inputHint = isPma
    ? `${t('addHand.inputAmountHint')} ${formatCurrencyUnit(currencyCode)}`
    : isHkCustom
    ? `${t('addHand.inputFanHint')} ${formatCurrencyUnit(currencyCode)}`
    : t('addHand.inputHint');

  const inputRegex = useMemo(() => (isPma ? /[^0-9.-]/g : /[^0-9.-]/g), [isPma]);
  const currentDealerSeatIndex = useMemo(() => {
    if (!bundle) {
      return 0;
    }
    return getDealerSeatIndexForNextHand(bundle.game.startingDealerSeatIndex ?? 0, bundle.hands);
  }, [bundle]);
  const liveFanValue = Number(inputValue.trim());
  const liveFanValid = Number.isInteger(liveFanValue) && liveFanValue >= 1;
  const liveEffectiveFan = liveFanValid
    ? capFan === null
      ? liveFanValue
      : Math.min(liveFanValue, capFan)
    : null;
  const liveBaseAmount = liveEffectiveFan !== null ? liveEffectiveFan * unitPerFan : null;
  const liveZimoPerLoser = liveBaseAmount !== null ? liveBaseAmount * 2 : null;
  const liveDiscarderPays =
    liveBaseAmount !== null ? (hkGunMode === 'fullGun' ? liveBaseAmount * 4 : liveBaseAmount * 2) : null;
  const liveOthersPay =
    liveBaseAmount !== null && hkGunMode === 'halfGun' ? liveBaseAmount : null;
  const handTypeOptions = useMemo(
    () =>
      (['normal', 'draw', 'bonus'] as const).map((type) => ({
        value: type,
        label: t(`addHand.type.${type}`),
      })),
    [t],
  );
  const settlementOptions = useMemo(
    () => [
      { value: 'zimo' as const, label: t('addHand.settlementType.zimo') },
      { value: 'discard' as const, label: t('addHand.settlementType.discard') },
    ],
    [t],
  );
  const winnerOptions = useMemo(
    () => (bundle?.players ?? []).map((player) => ({ key: player.id, label: player.name })),
    [bundle?.players],
  );
  const discarderOptions = useMemo(
    () => (bundle?.players ?? []).map((player) => ({ key: player.id, label: player.name })),
    [bundle?.players],
  );

  const loadBundle = useCallback(async () => {
    try {
      let data: GameBundle;
      try {
        setBreadcrumb('AddHand: before getGameBundle', { gameId });
        data = await getGameBundle(gameId);
        setBreadcrumb('AddHand: after getGameBundle', { gameId });
      } catch (err) {
        if (!err && __DEV__) {
          const bug = new Error('[BUG] falsy rejection');
          (bug as { breadcrumbs?: unknown }).breadcrumbs = dumpBreadcrumbs(10);
          console.error('[AddHand] step getGameBundle falsy', dumpBreadcrumbs(10));
          throw bug;
        }
        console.error('[AddHand] step getGameBundle failed', err ?? 'falsy', new Error('trace').stack);
        const wrapped = new Error('AddHand step getGameBundle failed');
        (wrapped as Error & { cause?: unknown }).cause = err;
        throw wrapped;
      }

      const parsedRules = parseRules(data.game.rulesJson, normalizeVariant(data.game.variant));
      const resolvedCurrencyCode = resolveCurrencyCode(
        parsedRules.currencyCode ?? inferCurrencyCodeFromSymbol(data.game.currencySymbol),
      );
      setMode(parsedRules.mode);
      setCurrencyCode(resolvedCurrencyCode);
      setHkScoringPreset(parsedRules.hk?.scoringPreset ?? 'traditionalFan');
      setHkGunMode(parsedRules.hk?.gunMode ?? 'halfGun');
      setUnitPerFan(parsedRules.hk?.unitPerFan ?? 1);
      setCapFan(parsedRules.hk?.capFan ?? null);
      setBundle(data);
      setBreadcrumb('AddHand: after setBundle', { playerCount: data.players.length, mode: parsedRules.mode });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AddHand] load failed', err ?? 'falsy', new Error('trace').stack);
      setError(message || t('errors.loadGame'));
    }
  }, [gameId, t]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          await loadBundle();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err ?? 'falsy');
          console.error('[AddHand] loadBundle failed', err ?? 'falsy', new Error('trace').stack);
          if (cancelled) {
            return;
          }
          setError(message || t('errors.loadGame'));
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadBundle, t]),
  );

  const handleSave = async () => {
    if (saving) {
      return;
    }
    setError(null);
    try {
      setSaving(true);
      if (!bundle) {
        setError(t('errors.loadGame'));
        return;
      }
      const numericValue = inputValue.trim().length === 0 ? null : Number(inputValue);

      if (isPma && (numericValue === null || Number.isNaN(numericValue))) {
        setError(t('errors.invalidAmount'));
        return;
      }
      if (isHkCustom) {
        if (numericValue === null || !Number.isInteger(numericValue) || numericValue <= 0) {
          setError(t('errors.invalidFan'));
          return;
        }
        if (!winnerId) {
          setError(t('errors.selectWinner'));
          return;
        }
        if (settlementType === 'discard') {
          if (!discarderId) {
            setError(t('errors.selectDiscarder'));
            return;
          }
          if (discarderId === winnerId) {
            setError(t('errors.discarderCannotBeWinner'));
            return;
          }
        }
      }

      try {
        setBreadcrumb('AddHand: before insertHand', { gameId, handType, mode });
        const winnerSeatIndex = winnerId
          ? bundle?.players.find((player) => player.id === winnerId)?.seatIndex ?? null
          : null;
        if (winnerId && winnerSeatIndex === null) {
          setError(t('errors.selectWinner'));
          return;
        }
        const handIsDraw = handType === 'draw';
        const discarderSeatIndex = discarderId
          ? bundle?.players.find((player) => player.id === discarderId)?.seatIndex ?? null
          : null;
        if (discarderId && discarderSeatIndex === null) {
          setError(t('errors.selectDiscarder'));
          return;
        }
        const settlementForCalc: HkSettlementType = isHkCustom
          ? settlementType
          : handType === 'draw'
          ? 'zimo'
          : 'discard';
        const customPayout = isHkCustom
          ? computeCustomPayout({
              fan: Number(numericValue),
              unitPerFan,
              capFan,
              gunMode: hkGunMode,
              settlementType: settlementForCalc,
            })
          : null;
        const hkRules = parseRules(bundle.game.rulesJson, normalizeVariant(bundle.game.variant));
        const shouldUseHkEngine =
          hkRules.mode === 'HK' &&
          numericValue !== null &&
          Number.isInteger(numericValue) &&
          numericValue >= (hkRules.minFanToWin ?? 0) &&
          winnerSeatIndex !== null &&
          (settlementForCalc === 'zimo' || discarderSeatIndex !== null);
        const hkSettlement = shouldUseHkEngine
          ? computeHkSettlement({
              rules: hkRules,
              fan: Number(numericValue),
              settlementType: settlementForCalc,
              winnerSeatIndex,
              discarderSeatIndex,
            })
          : null;
        const payoutShareText = customPayout
          ? [
              `${t('addHand.share.customTitle')} ${formatCurrencyUnit(currencyCode)}`,
              `${t('addHand.share.customFan')} ${customPayout.fan}`,
              `${t('addHand.share.customEffectiveFan')} ${customPayout.effectiveFan}`,
              `${t('addHand.share.customTotal')} ${formatCurrencyAmount(customPayout.totalWinAmount, currencyCode)}`,
            ].join(' | ')
          : null;
        await insertHand({
          id: makeId('hand'),
          gameId,
          dealerSeatIndex: currentDealerSeatIndex,
          isDraw: handIsDraw,
          winnerSeatIndex,
          type: isPma ? 'amount' : isHkCustom ? 'fan' : handType,
          winnerPlayerId: isPma ? null : winnerId,
          discarderPlayerId:
            isPma || (isHkCustom && settlementType === 'zimo') ? null : discarderId,
          inputValue: hkSettlement
            ? toAmountFromQ(hkSettlement.totalWinAmountQ)
            : customPayout
            ? customPayout.totalWinAmount
            : Number.isNaN(numericValue)
            ? null
            : numericValue,
          deltasJson: hkSettlement
            ? JSON.stringify(hkSettlement.deltasQ.map((valueQ) => toAmountFromQ(valueQ)))
            : null,
          computedJson: JSON.stringify(
            hkSettlement
              ? {
                  source: hkSettlement.source,
                  fan: Number(numericValue),
                  effectiveFan: hkSettlement.effectiveFan,
                  settlementType: settlementForCalc,
                  dealerSeatIndex: currentDealerSeatIndex,
                  isDraw: handIsDraw,
                  winnerSeatIndex,
                  discarderSeatIndex,
                  discarderPays: toAmountFromQ(hkSettlement.discarderPaysQ),
                  othersPay:
                    hkSettlement.othersPayQ === null
                      ? null
                      : toAmountFromQ(hkSettlement.othersPayQ),
                  totalWinAmount: toAmountFromQ(hkSettlement.totalWinAmountQ),
                }
              : customPayout
              ? {
                  fan: customPayout.fan,
                  effectiveFan: customPayout.effectiveFan,
                  unitPerFan,
                  gunMode: hkGunMode,
                  settlementType,
                  dealerSeatIndex: currentDealerSeatIndex,
                  isDraw: handIsDraw,
                  winnerSeatIndex,
                  zimoPerPlayer: customPayout.zimoPerPlayer,
                  discarderPays: customPayout.discarderPays,
                  otherPlayersPay: customPayout.otherPlayersPay,
                  totalWinAmount: customPayout.totalWinAmount,
                  shareText: payoutShareText,
                }
              : {},
          ),
          createdAt: Date.now(),
        });
        setBreadcrumb('AddHand: after insertHand', { gameId });
      } catch (err) {
        if (!err && __DEV__) {
          const bug = new Error('[BUG] falsy rejection');
          (bug as { breadcrumbs?: unknown }).breadcrumbs = dumpBreadcrumbs(10);
          console.error('[AddHand] step insertHand falsy', dumpBreadcrumbs(10));
          throw bug;
        }
        console.error('[AddHand] step insertHand failed', err ?? 'falsy', new Error('trace').stack);
        const wrapped = new Error('AddHand step insertHand failed');
        (wrapped as Error & { cause?: unknown }).cause = err;
        throw wrapped;
      }
      setBreadcrumb('AddHand: before goBack');
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AddHand] save failed', err ?? 'falsy', new Error('trace').stack);
      setError(message || t('errors.addHand'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.pageTitle}>{t('addHand.title')}</Text>
        <Text style={styles.currencyText}>
          {`${t('addHand.currency')}${formatCurrencyUnit(currencyCode)}`}
        </Text>
        {error && !showFanInlineError && !showWinnerInlineError && !showDiscarderInlineError ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {!isPma && !isHkCustom ? (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>{t('addHand.type')}</Text>
            <SegmentedControl
              options={handTypeOptions}
              value={handType}
              onChange={setHandType}
              disabled={saving}
            />
          </Card>
        ) : null}

        <Card style={styles.card}>
          <TextField
            label={inputLabel}
            value={inputValue}
            onChangeText={(value) => setInputValue(value.replace(inputRegex, ''))}
            placeholder="0"
          />
          <Text style={styles.helperText}>{inputHint}</Text>
          {isHkCustom && liveFanValue >= 1 && liveFanValid && liveEffectiveFan !== null && liveBaseAmount !== null ? (
            <>
              <Text style={styles.helperText}>
                {`${t('addHand.realtime.effectiveFan')} = ${
                  capFan === null ? `${liveFanValue}` : `min(${liveFanValue}, ${capFan})`
                } = ${liveEffectiveFan}`}
              </Text>
              <Text style={styles.helperTextSubLine}>
                {`${t('addHand.realtime.baseAmount')} = ${liveEffectiveFan} x ${unitPerFan} = ${formatCurrencyAmount(
                  liveBaseAmount,
                  currencyCode,
                )}`}
              </Text>
              {settlementType === 'zimo' && liveZimoPerLoser !== null ? (
                <Text style={styles.helperTextSubLine}>
                  {`${t('addHand.realtime.split.zimo')} ${formatCurrencyAmount(liveZimoPerLoser, currencyCode)} x 3`}
                </Text>
              ) : null}
              {settlementType === 'discard' && liveDiscarderPays !== null ? (
                <>
                  <Text style={styles.helperTextSubLine}>
                    {`${t('addHand.realtime.split.discarder')} ${formatCurrencyAmount(
                      liveDiscarderPays,
                      currencyCode,
                    )}`}
                  </Text>
                  {liveOthersPay !== null ? (
                    <Text style={styles.helperTextSubLine}>
                      {`${t('addHand.realtime.split.others')} ${formatCurrencyAmount(liveOthersPay, currencyCode)} x 2`}
                    </Text>
                  ) : null}
                </>
              ) : null}
              <Text style={styles.helperTextSubLine}>{t('addHand.realtime.reminder')}</Text>
            </>
          ) : null}
          {showFanInlineError ? <Text style={styles.errorText}>{error}</Text> : null}
        </Card>

        {!isPma ? (
          <Card style={styles.card}>
            {isHkCustom ? (
              <>
                <Text style={styles.sectionTitle}>{t('addHand.settlementType')}</Text>
                <SegmentedControl
                  options={settlementOptions}
                  value={settlementType}
                  onChange={(next) => {
                    setSettlementType(next);
                    if (next === 'zimo') {
                      setDiscarderId(null);
                    }
                  }}
                  disabled={saving}
                />
              </>
            ) : null}
            <Text style={styles.sectionTitle}>{t('addHand.winner')}</Text>
            <PillGroup
              options={winnerOptions}
              valueKey={winnerId}
              onChange={setWinnerId}
              disabled={saving}
              noneLabel={t('addHand.none')}
            />
            {showWinnerInlineError ? <Text style={styles.errorText}>{error}</Text> : null}
          </Card>
        ) : null}

        {!isPma && (!isHkCustom || settlementType === 'discard') ? (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>{t('addHand.discarder')}</Text>
            <PillGroup
              options={discarderOptions}
              valueKey={discarderId}
              onChange={setDiscarderId}
              disabled={saving}
              noneLabel={t('addHand.none')}
            />
            {showDiscarderInlineError ? <Text style={styles.errorText}>{error}</Text> : null}
          </Card>
        ) : null}

        {DEBUG_FLAGS.enableScrollSpacer ? <View style={styles.debugSpacer} /> : null}
      </ScrollView>

      <BottomActionBar
        primaryLabel={t('addHand.save')}
        onPrimaryPress={() => {
          handleSave().catch((err) => {
            console.error('[AddHand] save press failed', err);
          });
        }}
        secondaryLabel={t('common.back')}
        onSecondaryPress={() => navigation.goBack()}
        disabled={saving}
      />
    </KeyboardAvoidingView>
  );
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeVariant(value: string): Variant {
  if (value === 'HK' || value === 'TW' || value === 'PMA') {
    return value;
  }
  if (value === 'TW_SIMPLE') {
    return 'TW';
  }
  return 'HK';
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
    paddingBottom: 168,
  },
  pageTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: GRID.x2,
  },
  currencyText: {
    marginBottom: GRID.x1_5,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    marginBottom: GRID.x2,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
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
  helperText: {
    marginTop: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  helperTextSubLine: {
    marginTop: 6,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  debugSpacer: {
    height: 800,
  },
});

export default AddHandScreen;
