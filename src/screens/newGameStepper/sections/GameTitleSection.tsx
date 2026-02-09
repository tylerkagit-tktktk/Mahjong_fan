import { Ref } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
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
};

function GameTitleSection({ label, value, placeholder, onChangeText, inputRef, error }: Props) {
  return (
    <Card style={styles.card}>
      <TextField
        label={label}
        inputRef={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
      />
      {error ? <Text style={styles.inlineErrorText}>{error}</Text> : null}
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
