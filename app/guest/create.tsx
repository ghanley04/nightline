import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { User, Mail, Phone, Clock } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Card from '@/components/Card';
import colors from '@/constants/colors';

export default function CreateGuestPassScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { addGuestPass } = useSubscriptionStore();
  
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
  });

  const validateForm = () => {
    let isValid = true;
    const newErrors = {
      guestName: '',
      guestEmail: '',
      guestPhone: '',
    };

    if (!guestName) {
      newErrors.guestName = 'Guest name is required';
      isValid = false;
    }

    if (guestEmail && !/\S+@\S+\.\S+/.test(guestEmail)) {
      newErrors.guestEmail = 'Email is invalid';
      isValid = false;
    }

    if (guestPhone && !/^\d{10}$/.test(guestPhone.replace(/\D/g, ''))) {
      newErrors.guestPhone = 'Please enter a valid 10-digit phone number';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleCreateGuestPass = () => {
    if (!validateForm()) return;

    setIsLoading(true);

    // Create guest pass object
    const guestPass = {
      id: `guest-${Date.now()}`,
      hostUserId: user?.id || '',
      guestName,
      guestEmail: guestEmail || undefined,
      guestPhone: guestPhone || undefined,
      validUntil: new Date(new Date().setHours(23, 59, 59, 999)).toISOString(),
      isUsed: false,
      createdAt: new Date().toISOString(),
    };

    // Simulate payment and API call
    setTimeout(() => {
      addGuestPass(guestPass);
      
      // Show success message
      Alert.alert(
        'Guest Pass Created',
        'Your guest pass has been created and is valid until midnight tonight.',
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
          <Text style={styles.title}>Invite a Guest</Text>
          <Text style={styles.subtitle}>
            Create a one-time guest pass for $5
          </Text>
        </View>
        
        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>Guest Pass Information</Text>
          <Text style={styles.infoText}>
            Each guest pass costs $5 and is valid for one night only (until midnight).
            Your guest will need to show this pass to the driver when boarding.
          </Text>
          
          <View style={styles.validityInfo}>
            <Clock size={16} color={colors.primary} />
            <Text style={styles.validityText}>
              Valid until midnight tonight
            </Text>
          </View>
        </Card>
        
        <View style={styles.form}>
          <Text style={styles.formTitle}>Guest Information</Text>
          
          <Input
            label="Guest Name"
            placeholder="Enter guest's full name"
            value={guestName}
            onChangeText={setGuestName}
            error={errors.guestName}
          />
          
          <Input
            label="Guest Email (Optional)"
            placeholder="Enter guest's email"
            value={guestEmail}
            onChangeText={setGuestEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.guestEmail}
          />
          
          <Input
            label="Guest Phone (Optional)"
            placeholder="Enter guest's phone number"
            value={guestPhone}
            onChangeText={setGuestPhone}
            keyboardType="phone-pad"
            error={errors.guestPhone}
          />
        </View>
        
        <Card style={styles.paymentCard}>
          <Text style={styles.paymentTitle}>Payment Summary</Text>
          
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Guest Pass:</Text>
            <Text style={styles.paymentValue}>$5.00</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.paymentRow}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalValue}>$5.00</Text>
          </View>
        </Card>
      </ScrollView>
      
      <View style={styles.footer}>
        <Button
          title="Pay $5.00 and Create Pass"
          onPress={handleCreateGuestPass}
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
    marginBottom: 12,
    lineHeight: 20,
  },
  validityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  validityText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
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
  paymentCard: {
    marginBottom: 24,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  paymentLabel: {
    fontSize: 14,
    color: colors.textLight,
  },
  paymentValue: {
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