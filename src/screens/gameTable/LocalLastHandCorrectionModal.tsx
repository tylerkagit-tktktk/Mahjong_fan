import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import AppButton from '../../components/AppButton';
import AppText from '../../components/AppText';
import Card from '../../components/Card';
import PillGroup from '../../components/PillGroup';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import type { Hand, Player } from '../../models/db';
import theme from '../../theme/theme';

type Outcome = 'discard' | 'zimo' | 'draw';

type Props = {
  visible: boolean;
  hand: Hand | null;
  players: readonly Player[];
  minFan: number;
  maxFan: number;
  pending: boolean;
  unavailableReason: string | null;
  onDismiss: () => void;
  onReplace: (intent: {
    outcome: Outcome;
    fan?: number;
    winnerPlayerId?: string;
    discarderPlayerId?: string;
    dealerAction?: 'stick' | 'pass';
  }) => void;
  onUndo: () => void;
};

function parseIntent(hand: Hand | null): { outcome: Outcome; fan: number; dealerAction: 'stick' | 'pass' } {
  if (!hand) return { outcome: 'draw', fan: 1, dealerAction: 'stick' };
  try {
    const computed = JSON.parse(hand.computedJson) as { settlementType?: unknown; fan?: unknown; dealerAction?: unknown };
    const outcome: Outcome = hand.isDraw || computed.settlementType === 'draw'
      ? 'draw'
      : computed.settlementType === 'zimo' || hand.type === 'zimo'
        ? 'zimo'
        : 'discard';
    return {
      outcome,
      fan: typeof computed.fan === 'number' && Number.isInteger(computed.fan) ? computed.fan : 1,
      dealerAction: computed.dealerAction === 'pass' ? 'pass' : 'stick',
    };
  } catch {
    return { outcome: hand.isDraw ? 'draw' : 'discard', fan: 1, dealerAction: 'stick' };
  }
}

export default function LocalLastHandCorrectionModal({
  visible, hand, players, minFan, maxFan, pending, unavailableReason, onDismiss, onReplace, onUndo,
}: Props) {
  const { t } = useAppLanguage();
  const [outcome, setOutcome] = useState<Outcome>('discard');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [discarderId, setDiscarderId] = useState<string | null>(null);
  const [fan, setFan] = useState(minFan);
  const [dealerAction, setDealerAction] = useState<'stick' | 'pass'>('stick');

  useEffect(() => {
    if (!visible || !hand) return;
    const initial = parseIntent(hand);
    setOutcome(initial.outcome);
    setWinnerId(hand.winnerPlayerId ?? null);
    setDiscarderId(hand.discarderPlayerId ?? null);
    setFan(Math.min(maxFan, Math.max(minFan, initial.fan)));
    setDealerAction(initial.dealerAction);
  }, [hand, maxFan, minFan, visible]);

  const names = useMemo(() => new Map(players.map((player) => [player.id, player.name])), [players]);
  const playerOptions = useMemo(() => players.map((player) => ({ key: player.id, label: player.name })), [players]);
  const summary = hand
    ? outcome === 'draw'
      ? `${t('gameTable.correction.summary.draw')} · ${dealerAction === 'stick' ? t('gameTable.draw.stick') : t('gameTable.draw.pass')}`
      : `${outcome === 'zimo' ? t('addHand.settlementType.zimo') : t('addHand.settlementType.discard')} · ${names.get(winnerId ?? '') ?? '—'} · ${fan} ${t('gameTable.correction.fan')}`
    : '—';
  const valid = outcome === 'draw'
    ? Boolean(dealerAction)
    : Boolean(winnerId && (outcome === 'zimo' || (discarderId && discarderId !== winnerId)));

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={pending ? undefined : onDismiss}>
        <Pressable testID="local-last-hand-correction-modal" style={styles.card} onPress={(event) => event.stopPropagation()} accessibilityViewIsModal>
          <AppText style={styles.title}>{t('gameTable.correction.title')}</AppText>
          <AppText style={styles.summary} accessibilityLabel={t('gameTable.correction.summaryLabel').replace('{summary}', summary)}>
            {hand ? `${t('gameTable.correction.lastHand').replace('{count}', String(hand.handIndex + 1))} · ${summary}` : '—'}
          </AppText>
          {unavailableReason ? <AppText style={styles.error}>{unavailableReason}</AppText> : null}
          {!unavailableReason ? (
            <>
              <Card style={styles.section}>
                <AppText style={styles.label}>{t('addHand.settlementType')}</AppText>
                <PillGroup
                  options={[
                    { key: 'discard', label: t('addHand.settlementType.discard') },
                    { key: 'zimo', label: t('addHand.settlementType.zimo') },
                    { key: 'draw', label: t('gameTable.action.draw') },
                  ]}
                  valueKey={outcome}
                  onChange={(value) => setOutcome((value ?? 'draw') as Outcome)}
                  includeNoneOption={false}
                  disabled={pending}
                />
              </Card>
              {outcome === 'draw' ? (
                <Card style={styles.section}>
                  <AppText style={styles.label}>{t('game.detail.hand.field.dealerAction')}</AppText>
                  <PillGroup options={[{ key: 'stick', label: t('gameTable.draw.stick') }, { key: 'pass', label: t('gameTable.draw.pass') }]}
                    valueKey={dealerAction} onChange={(value) => setDealerAction((value ?? 'stick') as 'stick' | 'pass')}
                    includeNoneOption={false} disabled={pending} />
                </Card>
              ) : (
                <>
                  <Card style={styles.section}>
                    <AppText style={styles.label}>{t('addHand.winner')}</AppText>
                    <PillGroup options={playerOptions} valueKey={winnerId} onChange={setWinnerId} includeNoneOption={false} disabled={pending} />
                  </Card>
                  {outcome === 'discard' ? (
                    <Card style={styles.section}>
                      <AppText style={styles.label}>{t('addHand.discarder')}</AppText>
                      <PillGroup options={playerOptions.filter((player) => player.key !== winnerId)} valueKey={discarderId}
                        onChange={setDiscarderId} includeNoneOption={false} disabled={pending} />
                    </Card>
                  ) : null}
                  <Card style={styles.section}>
                    <AppText style={styles.label}>{t('addHand.inputFan')}</AppText>
                    <View style={styles.stepper}><Pressable onPress={() => setFan((value) => Math.max(minFan, value - 1))} disabled={pending} style={styles.stepperButton}><AppText>-</AppText></Pressable><AppText>{fan}</AppText><Pressable onPress={() => setFan((value) => Math.min(maxFan, value + 1))} disabled={pending} style={styles.stepperButton}><AppText>+</AppText></Pressable></View>
                  </Card>
                </>
              )}
            </>
          ) : null}
          <View style={styles.actions}>
            <AppButton label={t('common.back')} onPress={onDismiss} disabled={pending} variant="secondary" style={styles.button} />
            {!unavailableReason ? <AppButton testID="local-last-hand-undo" label={t('gameTable.correction.undo')} onPress={onUndo} disabled={pending} variant="secondary" style={styles.button} accessibilityLabel={t('gameTable.correction.undo')} /> : null}
            {!unavailableReason ? <AppButton testID="local-last-hand-save" label={t('gameTable.correction.save')} disabled={pending || !valid} style={styles.button} onPress={() => onReplace(outcome === 'draw' ? { outcome, dealerAction } : { outcome, fan, winnerPlayerId: winnerId ?? undefined, ...(outcome === 'discard' ? { discarderPlayerId: discarderId ?? undefined } : {}) })} /> : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  card: { backgroundColor: theme.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: theme.spacing.lg, maxHeight: '92%' },
  title: { fontSize: theme.fontSize.lg, fontWeight: '700', color: theme.colors.textPrimary },
  summary: { marginTop: theme.spacing.sm, color: theme.colors.textSecondary },
  error: { marginTop: theme.spacing.md, color: theme.colors.danger },
  section: { marginTop: theme.spacing.md }, label: { marginBottom: theme.spacing.sm, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperButton: { padding: theme.spacing.md, minWidth: 48, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg }, button: { flex: 1 },
});
