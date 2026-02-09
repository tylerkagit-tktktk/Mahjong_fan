import { StyleSheet, Text } from 'react-native';
import Card from '../../../components/Card';
import SegmentedControl from '../../../components/SegmentedControl';
import { Variant } from '../../../models/rules';
import theme from '../../../theme/theme';
import { GRID } from '../constants';

type Props = {
  title: string;
  value: Variant;
  onChange: (value: Variant) => void;
  disabled: boolean;
  labels: { hk: string; tw: string; pma: string };
};

function ModeSection({ title, value, onChange, disabled, labels }: Props) {
  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <SegmentedControl<Variant>
        options={[
          { value: 'HK', label: labels.hk },
          { value: 'TW', label: labels.tw },
          { value: 'PMA', label: labels.pma },
        ]}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
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
});

export default ModeSection;
