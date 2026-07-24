import { Ref } from 'react';
import AppText from '../../../components/AppText';
import { StyleSheet, TextInput } from 'react-native';
import Card from '../../../components/Card';
import TextField from '../../../components/TextField';
import theme from '../../../theme/theme';
import { GRID } from '../constants';

type Props = {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  inputRef: Ref<TextInput>;
  error: string | null;
  disabled?: boolean;
};

function GameTitleSection({ label, value, placeholder, onChangeText, inputRef, error, disabled = false }: Props) {
  return (
    <Card style={styles.card}>
      <TextField
        label={label}
        inputRef={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={!disabled}
      />
      {error ? <AppText style={styles.inlineErrorText}>{error}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: GRID.x2,
    padding: GRID.x2,
  },
  inlineErrorText: {
    marginTop: GRID.x1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
});

export default GameTitleSection;
