import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MapPin, Clock } from 'lucide-react-native';
import { BusStop } from '@/types';
import Card from './Card';
import colors from '@/constants/colors';

interface BusStopCardProps {
  stop: BusStop;
  onPress: (stop: BusStop) => void;
  isSelected?: boolean;
}

export const BusStopCard: React.FC<BusStopCardProps> = ({
  stop,
  onPress,
  isSelected = false,
}) => {
  const formatETA = (minutes: number) => {
    if (minutes < 1) return 'Arriving now';
    return `${minutes} min${minutes !== 1 ? 's' : ''}`;
  };

  return (
    <TouchableOpacity
      onPress={() => onPress(stop)}
      activeOpacity={0.7}
      style={styles.touchable}
    >
      <Card
        variant={isSelected ? 'raised' : 'default'}
        style={[styles.card, isSelected && styles.selectedCard]}
      >
        <View style={styles.header}>
          <View style={styles.nameContainer}>
            <View style={[styles.iconBg, isSelected && styles.iconBgSelected]}>
              <MapPin size={14} color={isSelected ? '#0A0A0F' : colors.primary} />
            </View>
            <Text style={[styles.name, isSelected && styles.nameSelected]}>
              {stop.name}
            </Text>
          </View>
          {stop.eta.length > 0 && (
            <View style={styles.etaBadge}>
              <Clock size={12} color={colors.primary} />
              <Text style={styles.etaBadgeText}>{formatETA(stop.eta[0])}</Text>
            </View>
          )}
        </View>

        {isSelected && stop.eta.length > 0 && (
          <View style={styles.etaList}>
            <Text style={styles.upcomingLabel}>Upcoming arrivals</Text>
            {stop.eta.map((eta, index) => (
              <View key={index} style={styles.etaRow}>
                <View style={styles.etaIndex}>
                  <Text style={styles.etaIndexText}>{index + 1}</Text>
                </View>
                <View style={styles.etaBar}>
                  <View
                    style={[
                      styles.etaBarFill,
                      { width: `${Math.max(10, 100 - eta * 4)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.etaTime}>{formatETA(eta)}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    marginBottom: 10,
  },
  card: {
    padding: 14,
  },
  selectedCard: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  iconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  iconBgSelected: {
    backgroundColor: colors.primary,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  nameSelected: {
    color: colors.primary,
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryGlow,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  etaBadgeText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  etaList: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 10,
  },
  upcomingLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  etaIndex: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  etaIndexText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  etaBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surfaceBorder,
    borderRadius: 2,
    overflow: 'hidden',
  },
  etaBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  etaTime: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    width: 70,
    textAlign: 'right',
  },
});

export default BusStopCard;