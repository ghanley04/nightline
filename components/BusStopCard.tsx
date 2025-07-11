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
    >
      <Card 
        // style={[
        //   styles.card,
        //   isSelected && styles.selectedCard
        // ]}
      >
        <View style={styles.header}>
          <View style={styles.nameContainer}>
            <MapPin size={18} color={colors.primary} />
            <Text style={styles.name}>{stop.name}</Text>
          </View>
          {stop.eta.length > 0 && (
            <View style={styles.nextBusContainer}>
              <Clock size={14} color={colors.textLight} />
              <Text style={styles.nextBusText}>
                Next: {formatETA(stop.eta[0])}
              </Text>
            </View>
          )}
        </View>

        {isSelected && stop.eta.length > 0 && (
          <View style={styles.etaList}>
            <Text style={styles.upcomingText}>Upcoming buses:</Text>
            {stop.eta.map((eta, index) => (
              <View key={index} style={styles.etaItem}>
                <Text style={styles.etaNumber}>{index + 1}</Text>
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
  card: {
    marginBottom: 12,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    color: colors.text,
  },
  nextBusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  nextBusText: {
    fontSize: 12,
    color: colors.textLight,
    marginLeft: 4,
  },
  etaList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  upcomingText: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: colors.text,
  },
  etaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  etaNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    color: colors.secondary,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 12,
    lineHeight: 20,
    marginRight: 8,
  },
  etaTime: {
    fontSize: 14,
    color: colors.text,
  },
});

export default BusStopCard;