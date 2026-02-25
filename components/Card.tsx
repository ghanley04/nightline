import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import colors from '@/constants/colors';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  elevation?: number;
  /** Use 'raised' for a more prominent surface (e.g. modals, featured cards) */
  variant?: 'default' | 'raised';
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  elevation = 2,
  variant = 'default',
}) => {
  const bgColor = variant === 'raised' ? colors.surfaceRaised : colors.surface;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bgColor,
          shadowOpacity: 0.4 * elevation,
          elevation: elevation,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
});

export default Card;