import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import TextField from '../components/TextField';
import Card from '../components/Card';
import theme from '../theme/theme';
import { RootStackParamList } from '../navigation/types';
import { getGameBundle, insertHand } from '../db/repo';
import { GameBundle } from '../models/db';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { dumpBreadcrumbs, setBreadcrumb } from '../debug/breadcrumbs';
import { DEBUG_FLAGS } from '../debug/debugFlags';

type Props = NativeStackScreenProps<RootStackParamList, 'AddHand'>;

function AddHandScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { t } = useAppLanguage();
  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [handType, setHandType] = useState<'normal' | 'draw' | 'bonus'>('normal');
  const [inputValue, setInputValue] = useState('');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [discarderId, setDiscarderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        throw new Error('AddHand step getGameBundle failed', { cause: err });
      }
      setBundle(data);
      setBreadcrumb('AddHand: after setBundle', { playerCount: data.players.length });
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
      const numericValue = inputValue.trim().length === 0 ? null : Number(inputValue);
      try {
        setBreadcrumb('AddHand: before insertHand', { gameId, handType });
        await insertHand({
          id: makeId('hand'),
          gameId,
          type: handType,
          winnerPlayerId: winnerId,
          discarderPlayerId: discarderId,
          inputValue: Number.isNaN(numericValue) ? null : numericValue,
          computedJson: JSON.stringify({}),
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
        throw new Error('AddHand step insertHand failed', { cause: err });
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
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('addHand.title')}</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('addHand.type')}</Text>
          <View style={styles.row}>
          {(['normal', 'draw', 'bonus'] as const).map((type) => (
            <Pressable
              key={type}
              style={[styles.optionButton, handType === type && styles.optionSelected]}
              onPress={() => setHandType(type)}
            >
              <Text style={styles.optionText}>{t(`addHand.type.${type}`)}</Text>
            </Pressable>
          ))}
          </View>
        </Card>
        <Card style={styles.card}>
          <TextField
            label={t('addHand.inputValue')}
            value={inputValue}
            onChangeText={(value) => setInputValue(value.replace(/[^0-9.-]/g, ''))}
            placeholder="0"
          />
          <Text style={styles.helperText}>{t('addHand.inputHint')}</Text>
        </Card>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('addHand.winner')}</Text>
          <View style={styles.rowWrap}>
            <Pressable
              style={[styles.optionButton, winnerId === null && styles.optionSelected]}
              onPress={() => setWinnerId(null)}
            >
              <Text style={styles.optionText}>{t('addHand.none')}</Text>
            </Pressable>
          {bundle?.players.map((player) => (
            <Pressable
              key={player.id}
              style={[styles.optionButton, winnerId === player.id && styles.optionSelected]}
              onPress={() => setWinnerId(player.id)}
            >
              <Text style={styles.optionText}>{player.name}</Text>
            </Pressable>
          ))}
          </View>
        </Card>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('addHand.discarder')}</Text>
          <View style={styles.rowWrap}>
            <Pressable
              style={[styles.optionButton, discarderId === null && styles.optionSelected]}
              onPress={() => setDiscarderId(null)}
            >
              <Text style={styles.optionText}>{t('addHand.none')}</Text>
            </Pressable>
          {bundle?.players.map((player) => (
            <Pressable
              key={player.id}
              style={[styles.optionButton, discarderId === player.id && styles.optionSelected]}
              onPress={() => setDiscarderId(player.id)}
            >
              <Text style={styles.optionText}>{player.name}</Text>
            </Pressable>
          ))}
          </View>
        </Card>
        <PrimaryButton label={t('addHand.save')} onPress={handleSave} disabled={saving} />
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
  errorText: {
    color: theme.colors.danger,
  },
  card: {
    marginBottom: theme.spacing.md,
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
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    marginBottom: theme.spacing.sm,
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
  helperText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  debugSpacer: {
    height: 800,
  },
});

export default AddHandScreen;
