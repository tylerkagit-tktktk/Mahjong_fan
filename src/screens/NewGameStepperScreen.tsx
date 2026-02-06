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
import { getDefaultRules, RulesV1, serializeRules, Variant } from '../models/rules';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { DEBUG_FLAGS } from '../debug/debugFlags';

type Props = NativeStackScreenProps<RootStackParamList, 'NewGameStepper'>;

const GRID = {
  x1: 8,
  x1_5: 12,
  x2: 16,
  x3: 24,
} as const;
const HIT_SLOP = { top: GRID.x1, right: GRID.x1, bottom: GRID.x1, left: GRID.x1 } as const;

const MIN_FAN_MIN = 0;
const MIN_FAN_MAX = 13;

function NewGameStepperScreen({ navigation }: Props) {
  const { t, language } = useAppLanguage();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [variant, setVariant] = useState<Variant>('HK');
  const [minFanToWin, setMinFanToWin] = useState(3);
  const [minFanInput, setMinFanInput] = useState('3');
  const [minFanTouched, setMinFanTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [players, setPlayers] = useState(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const seatLabels = useMemo(
    () => [t('seat.east'), t('seat.south'), t('seat.west'), t('seat.north')],
    [t],
  );

  const handleSetPlayer = (index: number, value: string) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleCreate = async () => {
    setError(null);
    setSubmitAttempted(true);
    if (loading) {
      return;
    }

    if (variant === 'HK') {
      const parsedMinFan = parseMinFan(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX);
      if (parsedMinFan === null) {
        return;
      }
      setMinFanToWin(parsedMinFan);
    }

    let resolvedPlayers = [...players];
    const hasAnyName = resolvedPlayers.some((name) => name.trim().length > 0);
    if (!hasAnyName) {
      resolvedPlayers = seatLabels.map((label) => label);
      setPlayers(resolvedPlayers);
    } else {
      resolvedPlayers = resolvedPlayers.map((name, index) => name.trim() || seatLabels[index]);
    }

    const gameId = makeId('game');
    const playerInputs = resolvedPlayers.map((name, index) => ({
      id: makeId('player'),
      gameId,
      name,
      seatIndex: index,
    }));

    const rules: RulesV1 = {
      ...getDefaultRules(variant),
      languageDefault: language,
      currencySymbol: '$',
    };
    if (variant === 'HK' && rules.hk) {
      rules.hk = { ...rules.hk, minFanToWin };
    }

    try {
      setLoading(true);
      await createGameWithPlayers(
        {
          id: gameId,
          title: title.trim() || t('home.sampleGame'),
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
      setError(t('errors.createGame'));
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

  const minFanError =
    variant === 'HK' && (minFanTouched || submitAttempted)
      ? getMinFanError(minFanInput, MIN_FAN_MIN, MIN_FAN_MAX, t('newGame.minFanValidation'))
      : null;

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
        <Text style={styles.pageTitle}>{t('newGame.title')}</Text>

        <Card style={styles.card}>
          <TextField
            label={t('newGame.gameTitle')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('newGame.gameTitlePlaceholder')}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('newGame.variant')}</Text>
          <View style={styles.segmentedRow}>
            <Pressable
              style={[
                styles.segmentedButton,
                styles.segmentedButtonSpacing,
                variant === 'HK' && styles.segmentedButtonActive,
              ]}
              onPress={() => setVariant('HK')}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, selected: variant === 'HK' }}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.segmentedText, variant === 'HK' && styles.segmentedTextActive]}>
                {t('newGame.variant.hk')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentedButton, variant === 'TW_SIMPLE' && styles.segmentedButtonActive]}
              onPress={() => setVariant('TW_SIMPLE')}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading, selected: variant === 'TW_SIMPLE' }}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.segmentedText, variant === 'TW_SIMPLE' && styles.segmentedTextActive]}>
                {t('newGame.variant.twSimple')}
              </Text>
            </Pressable>
          </View>
        </Card>

        {variant === 'HK' ? (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>{t('newGame.minFanToWin')}</Text>
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
            {minFanError ? <Text style={styles.inlineErrorText}>{minFanError}</Text> : null}
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('newGame.players')}</Text>
          <View style={styles.playersList}>
            {seatLabels.map((label, index) => (
              <TextField
                key={label}
                label={label}
                value={players[index]}
                onChangeText={(value) => handleSetPlayer(index, value)}
                placeholder={label}
              />
            ))}
          </View>
        </Card>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
    paddingHorizontal: GRID.x2,
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
  inlineErrorText: {
    marginTop: GRID.x1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  playersList: {
    gap: GRID.x1_5,
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
