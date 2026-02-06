import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppButton from '../components/AppButton';
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

const GRID = {
  x1: 8,
  x1_5: 12,
  x2: 16,
  x3: 24,
} as const;
const HIT_SLOP = { top: GRID.x1, right: GRID.x1, bottom: GRID.x1, left: GRID.x1 } as const;

function AddHandScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();

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
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('addHand.type')}</Text>
          <View style={styles.segmentedRow}>
            {(['normal', 'draw', 'bonus'] as const).map((type, index, list) => {
              const selected = handType === type;
              const isLast = index === list.length - 1;
              return (
                <Pressable
                  key={type}
                  style={[
                    styles.segmentedButton,
                    !isLast && styles.segmentedButtonSpacing,
                    selected && styles.segmentedButtonActive,
                  ]}
                  onPress={() => setHandType(type)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: saving, selected }}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={[styles.segmentedText, selected && styles.segmentedTextActive]}>
                    {t(`addHand.type.${type}`)}
                  </Text>
                </Pressable>
              );
            })}
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
          <View style={styles.pillWrap}>
            <ChoicePill
              label={t('addHand.none')}
              selected={winnerId === null}
              onPress={() => setWinnerId(null)}
              disabled={saving}
              style={styles.choicePillSpacing}
            />
            {bundle?.players.map((player) => (
              <ChoicePill
                key={player.id}
                label={player.name}
                selected={winnerId === player.id}
                onPress={() => setWinnerId(player.id)}
                disabled={saving}
                style={styles.choicePillSpacing}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('addHand.discarder')}</Text>
          <View style={styles.pillWrap}>
            <ChoicePill
              label={t('addHand.none')}
              selected={discarderId === null}
              onPress={() => setDiscarderId(null)}
              disabled={saving}
              style={styles.choicePillSpacing}
            />
            {bundle?.players.map((player) => (
              <ChoicePill
                key={player.id}
                label={player.name}
                selected={discarderId === player.id}
                onPress={() => setDiscarderId(player.id)}
                disabled={saving}
                style={styles.choicePillSpacing}
              />
            ))}
          </View>
        </Card>

        {DEBUG_FLAGS.enableScrollSpacer ? <View style={styles.debugSpacer} /> : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, GRID.x2) }]}>
        <AppButton label={t('addHand.save')} onPress={handleSave} disabled={saving} />
        <AppButton
          label={t('common.back')}
          onPress={() => navigation.goBack()}
          disabled={saving}
          variant="secondary"
          style={styles.secondaryAction}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

type ChoicePillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

function ChoicePill({ label, selected, onPress, disabled, style }: ChoicePillProps) {
  return (
    <Pressable
      style={[styles.choicePill, selected && styles.choicePillActive, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected }}
      hitSlop={HIT_SLOP}
    >
      <Text style={[styles.choicePillText, selected && styles.choicePillTextActive]}>{label}</Text>
    </Pressable>
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
  helperText: {
    marginTop: GRID.x1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  choicePillSpacing: {
    marginRight: GRID.x1,
    marginBottom: GRID.x1,
  },
  choicePill: {
    minWidth: 64,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: GRID.x1_5,
  },
  choicePillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E6F5F5',
  },
  choicePillText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
  },
  choicePillTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
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

export default AddHandScreen;
