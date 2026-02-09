import { StyleSheet, Text } from 'react-native';
import Card from '../../../components/Card';
import SegmentedControl from '../../../components/SegmentedControl';
import { CurrencyCode } from '../../../models/currency';
import theme from '../../../theme/theme';
import { GRID } from '../constants';

type Props = {
  title: string;
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
  disabled: boolean;
  labels: { hkd: string; twd: string; cny: string };
  helperText: string;
};

function CurrencySection({ title, value, onChange, disabled, labels, helperText }: Props) {
  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <SegmentedControl<CurrencyCode>
        options={[
          { value: 'HKD', label: labels.hkd },
          { value: 'TWD', label: labels.twd },
          { value: 'CNY', label: labels.cny },
        ]}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
      <Text style={styles.helperText}>{helperText}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
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
    lineHeight: 22,
  },
});

export default CurrencySection;
