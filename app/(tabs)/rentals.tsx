import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Calendar, Clock, MapPin, DollarSign, PlusCircle } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import Card from '@/components/Card';
import Button from '@/components/Button';
import colors from '@/constants/colors';

// Mock rental data
const mockRentals = [
  {
    id: 'rental-1',
    date: '2025-07-15',
    startTime: '8:00 PM',
    endTime: '11:00 PM',
    pickupLocation: 'Greek Town',
    dropoffLocation: 'Downtown Columbia',
    numberOfBuses: 1,
    totalPrice: 300,
    status: 'confirmed',
  },
];

export default function RentalsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  
  const handleNewRental = () => {
    router.push('/rental/request');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Bus Rentals</Text>
          <TouchableOpacity 
            style={styles.newButton}
            onPress={handleNewRental}
          >
            <PlusCircle size={20} color={colors.primary} />
            <Text style={styles.newButtonText}>New Rental</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.infoSection}>
          <Card style={styles.infoCard}>
            <Text style={styles.infoTitle}>Rent a Bus for Your Event</Text>
            <Text style={styles.infoText}>
              Need transportation for a special event? Rent a Night Line bus for your fraternity, 
              sorority, or student organization event.
            </Text>
            
            <View style={styles.infoDetails}>
              <View style={styles.infoItem}>
                <DollarSign size={16} color={colors.primary} />
                <Text style={styles.infoItemText}>$300 per bus</Text>
              </View>
              <View style={styles.infoItem}>
                <Calendar size={16} color={colors.primary} />
                <Text style={styles.infoItemText}>48hr advance notice</Text>
              </View>
            </View>
            
            <Button
              title="Request a Rental"
              onPress={handleNewRental}
              style={styles.rentalButton}
            />
          </Card>
        </View>
        
        <View style={styles.rentalsSection}>
          <Text style={styles.sectionTitle}>Your Rentals</Text>
          
          {mockRentals.length > 0 ? (
            mockRentals.map((rental) => (
              <Card key={rental.id} style={styles.rentalCard}>
                <View style={styles.rentalHeader}>
                  <Text style={styles.rentalTitle}>Event Bus Rental</Text>
                  <View style={styles.statusContainer}>
                    <View style={[
                      styles.statusDot,
                      { backgroundColor: rental.status === 'confirmed' ? colors.success : colors.warning }
                    ]} />
                    <Text style={[
                      styles.statusText,
                      { color: rental.status === 'confirmed' ? colors.success : colors.warning }
                    ]}>
                      {rental.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.rentalDetails}>
                  <View style={styles.detailItem}>
                    <Calendar size={16} color={colors.primary} />
                    <Text style={styles.detailText}>
                      {new Date(rental.date).toLocaleDateString()}
                    </Text>
                  </View>
                  
                  <View style={styles.detailItem}>
                    <Clock size={16} color={colors.primary} />
                    <Text style={styles.detailText}>
                      {rental.startTime} - {rental.endTime}
                    </Text>
                  </View>
                  
                  <View style={styles.detailItem}>
                    <MapPin size={16} color={colors.primary} />
                    <Text style={styles.detailText}>
                      {rental.pickupLocation} to {rental.dropoffLocation}
                    </Text>
                  </View>
                  
                  <View style={styles.detailItem}>
                    <DollarSign size={16} color={colors.primary} />
                    <Text style={styles.detailText}>
                      ${rental.totalPrice.toFixed(2)} ({rental.numberOfBuses} {rental.numberOfBuses === 1 ? 'bus' : 'buses'})
                    </Text>
                  </View>
                </View>
                
                <View style={styles.rentalActions}>
                  <Button
                    title="Contact Driver"
                    variant="outline"
                    onPress={() => {}}
                    style={styles.actionButton}
                  />
                  <Button
                    title="Cancel Rental"
                    variant="secondary"
                    onPress={() => {}}
                    style={styles.actionButton}
                  />
                </View>
              </Card>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?q=80&w=2158&auto=format&fit=crop' }}
                style={styles.emptyImage}
              />
              <Text style={styles.emptyTitle}>No Rentals Yet</Text>
              <Text style={styles.emptyText}>
                You haven't requested any bus rentals yet. Need transportation for an event?
              </Text>
              <Button
                title="Request Your First Rental"
                onPress={handleNewRental}
                style={styles.emptyButton}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  newButtonText: {
    marginLeft: 6,
    color: colors.primary,
    fontWeight: '500',
  },
  infoSection: {
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: colors.primary + '10', // 10% opacity
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 16,
  },
  infoDetails: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  infoItemText: {
    marginLeft: 6,
    fontSize: 14,
    color: colors.text,
  },
  rentalButton: {
    marginTop: 8,
  },
  rentalsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  rentalCard: {
    marginBottom: 16,
  },
  rentalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rentalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  rentalDetails: {
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.text,
  },
  rentalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 0.48,
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyImage: {
    width: 150,
    height: 150,
    marginBottom: 16,
    borderRadius: 75,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    width: '100%',
  },
});