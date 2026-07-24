import { forwardRef, useMemo } from 'react';
import { StyleSheet, TextInput, TextInputProps, TextStyle } from 'react-native';
import { useAppPreferences } from '../settings/useAppPreferences';

function scaleTextStyle(style: TextInputProps['style'], scale: number): TextStyle {
  const flattened = StyleSheet.flatten(style) ?? {};
  return {
    ...flattened,
    fontSize: (flattened.fontSize ?? 14) * scale,
    lineHeight: flattened.lineHeight == null ? undefined : flattened.lineHeight * scale,
  };
}

const AppTextInput = forwardRef<TextInput, TextInputProps>(function AppTextInput({ style, maxFontSizeMultiplier, ...props }, ref) {
  const { textScale } = useAppPreferences();
  const scaledStyle = useMemo(() => scaleTextStyle(style, textScale), [style, textScale]);

  return <TextInput {...props} ref={ref} style={scaledStyle} maxFontSizeMultiplier={maxFontSizeMultiplier ?? 1} />;
});

export default AppTextInput;
