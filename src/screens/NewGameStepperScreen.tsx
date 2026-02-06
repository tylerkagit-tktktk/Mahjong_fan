import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import TextField from '../components/TextField';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { createGameWithPlayers } from '../db/repo';
import { getDefaultRules, RulesV1, serializeRules, Variant } from '../models/rules';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { DEBUG_FLAGS } from '../debug/debugFlags';

type Props = NativeStackScreenProps<RootStackParamList, 'NewGameStepper'>;

function NewGameStepperScreen({ navigation }: Props) {
  const { t, language } = useAppLanguage();
  const [title, setTitle] = useState('');
  const [variant, setVariant] = useState<Variant>('HK');
  const [minFanToWin, setMinFanToWin] = useState(3);
  const [players, setPlayers] = useState(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const seatLabels = useMemo(
    () => [
      t('seat.east'),
      t('seat.south'),
      t('seat.west'),
      t('seat.north'),
    ],
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
    if (loading) {
      return;
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
    setMinFanToWin((prev) => Math.max(1, prev + delta));
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('newGame.title')}</Text>
        <TextField
          label={t('newGame.gameTitle')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('newGame.gameTitlePlaceholder')}
        />
        <Text style={styles.sectionTitle}>{t('newGame.variant')}</Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.optionButton, variant === 'HK' && styles.optionSelected]}
            onPress={() => setVariant('HK')}
          >
            <Text style={styles.optionText}>{t('newGame.variant.hk')}</Text>
          </Pressable>
          <Pressable
            style={[styles.optionButton, variant === 'TW_SIMPLE' && styles.optionSelected, styles.optionButtonLast]}
            onPress={() => setVariant('TW_SIMPLE')}
          >
            <Text style={styles.optionText}>{t('newGame.variant.twSimple')}</Text>
          </Pressable>
        </View>
        {variant === 'HK' ? (
          <View style={styles.minFanRow}>
            <Text style={styles.sectionTitle}>{t('newGame.minFanToWin')}</Text>
            <View style={styles.row}>
            <Pressable style={styles.optionButton} onPress={() => adjustMinFan(-1)}>
              <Text style={styles.optionText}>-</Text>
            </Pressable>
            <Text style={styles.minFanValue}>{minFanToWin}</Text>
            <Pressable style={[styles.optionButton, styles.optionButtonLast]} onPress={() => adjustMinFan(1)}>
              <Text style={styles.optionText}>+</Text>
            </Pressable>
          </View>
        </View>
        ) : null}
        <Text style={styles.sectionTitle}>{t('newGame.players')}</Text>
        {seatLabels.map((label, index) => (
          <TextField
            key={label}
            label={label}
            value={players[index]}
            onChangeText={(value) => handleSetPlayer(index, value)}
            placeholder={label}
          />
        ))}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton label={t('newGame.create')} onPress={handleCreate} disabled={loading} />
        <PrimaryButton label={t('common.back')} onPress={() => navigation.goBack()} />
        {DEBUG_FLAGS.enableScrollSpacer ? <View style={styles.debugSpacer} /> : null}
      </ScrollView>
    </View>
  );
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
    padding: theme.spacing.lg,
    flexGrow: 1,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
  },
  optionButtonLast: {
    marginRight: 0,
  },
  optionSelected: {
    borderColor: theme.colors.primary,
  },
  optionText: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  minFanRow: {
    marginBottom: theme.spacing.md,
  },
  minFanValue: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  errorText: {
    color: theme.colors.danger,
  },
  debugSpacer: {
    height: 800,
  },
});

export default NewGameStepperScreen;
