import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import colors from '@/constants/colors';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  elevation?: number;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  style, 
  elevation = 2 
}) => {
  return (
    <View 
      style={[
        styles.card, 
        { 
          shadowOpacity: 0.1 * elevation,
          elevation: elevation,
        },
        style
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
});

export default Card;