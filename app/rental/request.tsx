import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Calendar, Clock, MapPin, Users, DollarSign } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Card from '@/components/Card';
import colors from '@/constants/colors';

export default function BusRentalRequestScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [numberOfBuses, setNumberOfBuses] = useState('1');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({
    date: '',
    startTime: '',
    endTime: '',
    pickupLocation: '',
    dropoffLocation: '',
    numberOfBuses: '',
  });

  const validateForm = () => {
    let isValid = true;
    const newErrors = {
      date: '',
      startTime: '',
      endTime: '',
      pickupLocation: '',
      dropoffLocation: '',
      numberOfBuses: '',
    };

    if (!date) {
      newErrors.date = 'Date is required';
      isValid = false;
    }

    if (!startTime) {
      newErrors.startTime = 'Start time is required';
      isValid = false;
    }

    if (!endTime) {
      newErrors.endTime = 'End time is required';
      isValid = false;
    }

    if (!pickupLocation) {
      newErrors.pickupLocation = 'Pickup location is required';
      isValid = false;
    }

    if (!dropoffLocation) {
      newErrors.dropoffLocation = 'Dropoff location is required';
      isValid = false;
    }

    if (!numberOfBuses) {
      newErrors.numberOfBuses = 'Number of buses is required';
      isValid = false;
    } else if (parseInt(numberOfBuses) < 1 || parseInt(numberOfBuses) > 5) {
      newErrors.numberOfBuses = 'Number of buses must be between 1 and 5';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmitRequest = () => {
    if (!validateForm()) return;

    setIsLoading(true);

    // Calculate total price
    const buses = parseInt(numberOfBuses);
    const totalPrice = buses * 300;

    // Simulate API call
    setTimeout(() => {
      // Show success message
      Alert.alert(
        'Request Submitted',
        `Your bus rental request has been submitted. Total cost: $${totalPrice.toFixed(2)}. We'll contact you to confirm details and payment.`,
        [
          { 
            text: 'OK', 
            onPress: () => router.back() 
          }
        ]
      );
      
      setIsLoading(false);
    }, 1500);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Request Bus Rental</Text>
          <Text style={styles.subtitle}>
            Rent a bus for your event or organization
          </Text>
        </View>
        
        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>Rental Information</Text>
          <Text style={styles.infoText}>
            Bus rentals cost $300 per bus. Each bus can accommodate up to 30 passengers.
            Rentals are subject to availability and require at least 48 hours notice.
          </Text>
        </Card>
        
        <View style={styles.form}>
          <Text style={styles.formTitle}>Event Details</Text>
          
          <Input
            label="Date"
            placeholder="MM/DD/YYYY"
            value={date}
            onChangeText={setDate}
            error={errors.date}
          />
          
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Input
                label="Start Time"
                placeholder="HH:MM AM/PM"
                value={startTime}
                onChangeText={setStartTime}
                error={errors.startTime}
              />
            </View>
            
            <View style={styles.halfInput}>
              <Input
                label="End Time"
                placeholder="HH:MM AM/PM"
                value={endTime}
                onChangeText={setEndTime}
                error={errors.endTime}
              />
            </View>
          </View>
          
          <Input
            label="Pickup Location"
            placeholder="Enter pickup address"
            value={pickupLocation}
            onChangeText={setPickupLocation}
            error={errors.pickupLocation}
          />
          
          <Input
            label="Dropoff Location"
            placeholder="Enter dropoff address"
            value={dropoffLocation}
            onChangeText={setDropoffLocation}
            error={errors.dropoffLocation}
          />
          
          <Input
            label="Number of Buses"
            placeholder="1-5"
            value={numberOfBuses}
            onChangeText={setNumberOfBuses}
            keyboardType="number-pad"
            maxLength={1}
            error={errors.numberOfBuses}
          />
        </View>
        
        <Card style={styles.costCard}>
          <Text style={styles.costTitle}>Cost Estimate</Text>
          
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Bus Rental:</Text>
            <Text style={styles.costValue}>
              ${(parseInt(numberOfBuses) || 0) * 300}.00
            </Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.costRow}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalValue}>
              ${(parseInt(numberOfBuses) || 0) * 300}.00
            </Text>
          </View>
          
          <Text style={styles.costNote}>
            Payment will be collected after your request is confirmed.
          </Text>
        </Card>
      </ScrollView>
      
      <View style={styles.footer}>
        <Button
          title="Submit Request"
          onPress={handleSubmitRequest}
          loading={isLoading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
  },
  infoCard: {
    marginBottom: 24,
    backgroundColor: colors.primary + '10', // 10% opacity
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  form: {
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    width: '48%',
  },
  costCard: {
    marginBottom: 24,
  },
  costTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  costLabel: {
    fontSize: 14,
    color: colors.textLight,
  },
  costValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
  },
  costNote: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 8,
    fontStyle: 'italic',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});