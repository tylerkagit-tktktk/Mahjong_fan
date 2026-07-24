import { ComponentProps, useMemo } from 'react';
import { StyleSheet, Text as NativeText, TextStyle } from 'react-native';
import { useAppPreferences } from '../settings/useAppPreferences';

type Props = ComponentProps<typeof NativeText>;

function scaleTextStyle(style: Props['style'], scale: number): TextStyle {
  const flattened = StyleSheet.flatten(style) ?? {};
  return {
    ...flattened,
    fontSize: (flattened.fontSize ?? 14) * scale,
    lineHeight: flattened.lineHeight == null ? undefined : flattened.lineHeight * scale,
  };
}

function AppText({ style, maxFontSizeMultiplier, ...props }: Props) {
  const { textScale } = useAppPreferences();
  const scaledStyle = useMemo(() => scaleTextStyle(style, textScale), [style, textScale]);

  return <NativeText {...props} style={scaledStyle} maxFontSizeMultiplier={maxFontSizeMultiplier ?? 1} />;
}

export default AppText;
