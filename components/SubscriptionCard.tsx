import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
//import { Check } from 'lucide-react-native';
import Card from './Card';
import colors from '@/constants/colors';

interface SubscriptionCardProps {
  title: string;
  price: number;
  features: string[];
  isRecommended?: boolean;
  onSelect: () => void;
  isSelected?: boolean;
  disabled?: boolean;
}

export const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  title,
  price,
  features,
  isRecommended = false,
  onSelect,
  isSelected = false,
  disabled = false,
}) => {
  return (
    <TouchableOpacity 
      onPress={onSelect}
      activeOpacity={0.8}
      disabled={disabled}
    >
      <Card 
        // style={[
        //   styles.card,
        //   isSelected && styles.selectedCard,
        //   disabled && styles.disabledCard
        // ]}
      >
        {isRecommended && (
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedText}>Recommended</Text>
          </View>
        )}
        
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.priceContainer}>
            <Text style={styles.price}>${price.toFixed(2)}</Text>
            <Text style={styles.period}>/month</Text>
          </View>
        </View>
        
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              {/* <Check size={16} color={colors.primary} /> */}
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
        
        <View style={styles.selectContainer}>
          <View 
            style={[
              styles.radioButton,
              isSelected && styles.radioButtonSelected,
              disabled && styles.radioButtonDisabled
            ]}
          >
            {isSelected && <View style={styles.radioButtonInner} />}
          </View>
          <Text style={[
            styles.selectText,
            disabled && styles.disabledText
          ]}>
            {isSelected ? 'Selected' : disabled ? 'Not Available' : 'Select Plan'}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 0,
    overflow: 'hidden',
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  disabledCard: {
    opacity: 0.6,
  },
  recommendedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  recommendedText: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    padding: 16,
    backgroundColor: colors.secondary,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.background,
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  period: {
    fontSize: 14,
    color: colors.background,
    marginLeft: 4,
  },
  featuresContainer: {
    padding: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.text,
  },
  selectContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: colors.primary,
  },
  radioButtonDisabled: {
    borderColor: colors.textLight,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  selectText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  disabledText: {
    color: colors.textLight,
  },
});

export default SubscriptionCard;