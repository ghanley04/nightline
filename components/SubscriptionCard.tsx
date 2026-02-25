import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
      style={[
        styles.card,
        isSelected && styles.cardSelected,
        disabled && styles.cardDisabled,
      ]}
    >
      {isRecommended && (
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedText}>★ Recommended</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceCurrency}>$</Text>
          <Text style={styles.price}>{price.toFixed(2)}</Text>
          <Text style={styles.period}>/mo</Text>
        </View>
      </View>

      {/* Features */}
      <View style={styles.featuresContainer}>
        {features.map((feature, index) => (
          <View key={index} style={styles.featureItem}>
            <Text style={styles.featureDot}>·</Text>
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      {/* Select row */}
      <View style={styles.selectRow}>
        <View
          style={[
            styles.radio,
            isSelected && styles.radioSelected,
            disabled && styles.radioDisabled,
          ]}
        >
          {isSelected && <View style={styles.radioInner} />}
        </View>
        <Text
          style={[
            styles.selectText,
            isSelected && styles.selectTextActive,
            disabled && styles.selectTextDisabled,
          ]}
        >
          {isSelected ? 'Selected' : disabled ? 'Not Available' : 'Select Plan'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  cardSelected: {
    borderColor: colors.primary,
    shadowColor: colors.shadowGold,
    shadowOpacity: 0.5,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  recommendedBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: colors.primaryGlow,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    zIndex: 1,
  },
  recommendedText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  header: {
    padding: 18,
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceCurrency: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginRight: 1,
  },
  price: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },
  period: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  featuresContainer: {
    padding: 18,
    gap: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  featureDot: {
    fontSize: 20,
    color: colors.primary,
    lineHeight: 20,
    marginTop: -2,
  },
  featureText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDisabled: {
    borderColor: colors.textMuted,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  selectText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  selectTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  selectTextDisabled: {
    color: colors.textMuted,
  },
});

export default SubscriptionCard;