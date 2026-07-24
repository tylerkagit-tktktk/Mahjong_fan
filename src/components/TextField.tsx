import { Ref } from 'react';
import AppTextInput from './AppTextInput';
import AppText from './AppText';
import {
  StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import theme from '../theme/theme';

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: ViewStyle;
  inputRef?: Ref<TextInput>;
  onFocus?: TextInputProps['onFocus'];
  editable?: boolean;
};

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  style,
  inputRef,
  onFocus,
  editable = true,
}: TextFieldProps) {
  return (
    <View style={[styles.container, style]}>
      <AppText style={styles.label}>{label}</AppText>
      <AppTextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        editable={editable}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
  },
});

export default TextField;
