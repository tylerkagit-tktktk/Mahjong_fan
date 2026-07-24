import { useMemo } from 'react';
import AppText from './AppText';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { computeHkSettlement } from '../domain/hk/settlement';
import { useAppLanguage } from '../i18n/useAppLanguage';
import { RulesV1 } from '../models/rules';
import theme from '../theme/theme';
import { typography } from '../styles/typography';

type Props = {
  visible: boolean;
  rules: RulesV1 | null;
  onClose: () => void;
};

type PaytableRow = {
  fan: number;
  discardTotal: number;
  zimoTotal: number;
};

function formatMoneyValue(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.00$/, '');
}

function TraditionalHkPaytableModal({ visible, rules, onClose }: Props) {
  const { t } = useAppLanguage();

  const paytable = useMemo(() => {
    if (!rules || rules.mode !== 'HK' || !rules.hk || rules.hk.scoringPreset !== 'traditionalFan') {
      return null;
    }

    const minimumFan = Math.max(rules.minFanToWin ?? 0, 1);
    const capFan = typeof rules.hk.capFan === 'number' ? rules.hk.capFan : 13;
    const maximumFan = Math.min(capFan, 13);
    const startFan = minimumFan <= maximumFan ? minimumFan : 3;
    const endFan = minimumFan <= maximumFan ? maximumFan : 10;
    const stakeLabel =
      rules.hk.stakePreset === 'TWO_FIVE_CHICKEN'
        ? t('newGame.hkStakePreset.twoFiveChicken')
        : rules.hk.stakePreset === 'FIVE_ONE'
        ? t('newGame.hkStakePreset.fiveOne')
        : t('newGame.hkStakePreset.oneTwo');
    const gunModeLabel = rules.hk.gunMode === 'halfGun' ? t('newGame.hkGunMode.half') : t('newGame.hkGunMode.full');
    const rows: PaytableRow[] = [];

    for (let fan = startFan; fan <= endFan; fan += 1) {
      const zimo = computeHkSettlement({
        rules,
        fan,
        settlementType: 'zimo',
        winnerSeatIndex: 1,
        discarderSeatIndex: null,
      });
      const discard = computeHkSettlement({
        rules,
        fan,
        settlementType: 'discard',
        winnerSeatIndex: 1,
        discarderSeatIndex: 0,
      });
      rows.push({ fan, discardTotal: discard.deltasQ[1] / 4, zimoTotal: zimo.deltasQ[1] / 4 });
    }

    return { rows, startFan, endFan, stakeLabel, gunModeLabel, currencySymbol: rules.currencySymbol };
  }, [rules, t]);

  const rangeLabel = useMemo(() => {
    if (!paytable) {
      return t('gameTable.paytable.traditional');
    }
    const range =
      paytable.startFan === paytable.endFan
        ? t('gameTable.paytable.fanValue').replace('{fan}', String(paytable.startFan))
        : t('gameTable.paytable.fanRange')
            .replace('{min}', String(paytable.startFan))
            .replace('{max}', String(paytable.endFan));
    return t('gameTable.paytable.range').replace('{range}', range);
  }, [paytable, t]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <AppText style={styles.title}>{paytable ? `${paytable.stakeLabel} · ${paytable.gunModeLabel}` : ''}</AppText>
            <AppText style={styles.subtitle}>{rangeLabel}</AppText>
            <AppText style={styles.caption}>{t('gameTable.paytable.caption')}</AppText>
          </View>

          <ScrollView style={styles.scroll} horizontal>
            <View>
              <View style={styles.rowHeader}>
                <AppText style={[styles.cell, styles.fanCell]}>{t('gameTable.paytable.col.fan')}</AppText>
                <AppText style={styles.cell}>{t('gameTable.paytable.col.discard')}</AppText>
                <AppText style={styles.cell}>{t('gameTable.paytable.col.zimo')}</AppText>
              </View>
              {paytable?.rows.map((row) => (
                <View key={row.fan} style={styles.row}>
                  <AppText style={[styles.cell, styles.fanCell]}>{t('gameTable.paytable.fanValue').replace('{fan}', String(row.fan))}</AppText>
                  <AppText style={styles.cell}>{`${paytable.currencySymbol}${formatMoneyValue(row.discardTotal)}`}</AppText>
                  <AppText style={styles.cell}>{`${paytable.currencySymbol}${formatMoneyValue(row.zimoTotal)}`}</AppText>
                </View>
              ))}
            </View>
          </ScrollView>

          <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button">
            <AppText style={styles.closeText}>{t('gameTable.paytable.close')}</AppText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  card: { width: '88%', maxHeight: '70%', backgroundColor: theme.colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  header: { marginBottom: 8 },
  title: { ...typography.subtitle, fontSize: theme.fontSize.md, fontWeight: '600', color: theme.colors.textPrimary },
  subtitle: { ...typography.caption, marginTop: 2, fontSize: 12, color: theme.colors.textSecondary },
  caption: { ...typography.caption, marginTop: 2, fontSize: 11, color: theme.colors.textSecondary },
  scroll: { marginTop: 8, marginBottom: 8 },
  rowHeader: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E4EA', paddingBottom: 4, marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 2 },
  cell: { ...typography.caption, width: 128, fontSize: 11, color: theme.colors.textPrimary },
  fanCell: { width: 72, fontWeight: '500' },
  closeButton: { alignSelf: 'center', marginTop: 4, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999, backgroundColor: '#EEF3F8' },
  closeText: { ...typography.caption, fontSize: 13, color: theme.colors.primary, fontWeight: '500' },
});

export default TraditionalHkPaytableModal;
