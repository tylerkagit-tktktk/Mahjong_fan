import { ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  horizontalPadding?: number;
  includeTopInset?: boolean;
  includeBottomInset?: boolean;
  centerContent?: boolean;
};

function ScreenContainer({
  children,
  style,
  contentStyle,
  horizontalPadding = 16,
  includeTopInset = true,
  includeBottomInset = true,
  centerContent = false,
}: Props) {
  const edges = useMemo(() => {
    const next: Edge[] = [];
    if (includeTopInset) {
      next.push('top');
    }
    if (includeBottomInset) {
      next.push('bottom');
    }
    return next;
  }, [includeBottomInset, includeTopInset]);

  const resolvedContentStyle = useMemo(
    () => ({
      paddingHorizontal: horizontalPadding,
      justifyContent: centerContent ? ('center' as const) : ('flex-start' as const),
    }),
    [centerContent, horizontalPadding],
  );

  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={edges}>
      <View
        style={[
          styles.content,
          resolvedContentStyle,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

export default ScreenContainer;
