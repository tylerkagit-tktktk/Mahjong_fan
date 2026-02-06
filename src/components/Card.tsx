import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import theme from '../theme/theme';

type CardProps = {
  children: ReactNode;
  style?: ViewStyle;
};

function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});

export default Card;
