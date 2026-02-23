import { Platform, TextStyle } from 'react-native';
import theme from '../theme/theme';

type TypographyKey = 'title' | 'subtitle' | 'body' | 'caption' | 'button';

const tokens: Record<TypographyKey, TextStyle> = {
  title: {
    fontSize: theme.fontSize.xl,
    lineHeight: 34,
    ...Platform.select({
      ios: { fontWeight: '700' as const },
      android: { fontWeight: '600' as const },
      default: { fontWeight: '700' as const },
    }),
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    lineHeight: 24,
    ...Platform.select({
      ios: { fontWeight: '600' as const },
      android: { fontWeight: '500' as const },
      default: { fontWeight: '600' as const },
    }),
  },
  body: {
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    ...Platform.select({
      ios: { fontWeight: '500' as const },
      android: { fontWeight: '400' as const },
      default: { fontWeight: '500' as const },
    }),
  },
  caption: {
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
    ...Platform.select({
      ios: { fontWeight: '500' as const },
      android: { fontWeight: '400' as const },
      default: { fontWeight: '500' as const },
    }),
  },
  button: {
    fontSize: theme.fontSize.md,
    lineHeight: 22,
    ...Platform.select({
      ios: { fontWeight: '600' as const },
      android: { fontWeight: '500' as const },
      default: { fontWeight: '600' as const },
    }),
    letterSpacing: 0.2,
  },
};

export const typography = tokens;
