import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CreditCard, Calendar, Lock } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Card from '@/components/Card';
import colors from '@/constants/colors';

export default function PaymentScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const { subscription } = useSubscriptionStore();
  
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState(user?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    name: '',
  });

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return value;
    }
  };

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    
    if (v.length >= 2) {
      return `${v.substring(0, 2)}/${v.substring(2, 4)}`;
    }
    
    return v;
  };

  const handleCardNumberChange = (value: string) => {
    setCardNumber(formatCardNumber(value));
  };

  const handleExpiryDateChange = (value: string) => {
    setExpiryDate(formatExpiryDate(value));
  };

  const validateForm = () => {
    let isValid = true;
    const newErrors = {
      cardNumber: '',
      expiryDate: '',
      cvv: '',
      name: '',
    };

    // Validate card number (simple validation for demo)
    if (!cardNumber) {
      newErrors.cardNumber = 'Card number is required';
      isValid = false;
    } else if (cardNumber.replace(/\s/g, '').length !== 16) {
      newErrors.cardNumber = 'Card number must be 16 digits';
      isValid = false;
    }

    // Validate expiry date
    if (!expiryDate) {
      newErrors.expiryDate = 'Expiry date is required';
      isValid = false;
    } else if (!/^\d{2}\/\d{2}$/.test(expiryDate)) {
      newErrors.expiryDate = 'Invalid format (MM/YY)';
      isValid = false;
    }

    // Validate CVV
    if (!cvv) {
      newErrors.cvv = 'CVV is required';
      isValid = false;
    } else if (!/^\d{3,4}$/.test(cvv)) {
      newErrors.cvv = 'CVV must be 3 or 4 digits';
      isValid = false;
    }

    // Validate name
    if (!name) {
      newErrors.name = 'Name is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handlePayment = () => {
    if (!validateForm()) return;

    setIsLoading(true);

    // Simulate payment processing
    setTimeout(() => {
      if (user) {
        // Update user with subscription info
        setUser({
          ...user,
          subscriptionActive: true,
          subscriptionType: subscription?.type,
          subscriptionEndDate: subscription?.endDate,
        });
      }
      
      // Show success message
      Alert.alert(
        'Payment Successful',
        'Your subscription has been activated!',
        [
          { 
            text: 'OK', 
            onPress: () => router.replace('/(tabs)') 
          }
        ]
      );
      
      setIsLoading(false);
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Payment Details</Text>
          <Text style={styles.subtitle}>
            Complete your subscription purchase
          </Text>
        </View>
        
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Plan:</Text>
            <Text style={styles.summaryValue}>
              {subscription?.type === 'individual' ? 'Individual Plan' : 
               subscription?.type === 'greek' ? 'Greek Life Plan' : 'Summer Plan'}
            </Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Duration:</Text>
            <Text style={styles.summaryValue}>9 months</Text>
          </View>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Price:</Text>
            <Text style={styles.summaryValue}>${subscription?.price.toFixed(2)}/month</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalValue}>
              ${(subscription?.price || 0).toFixed(2)}/month
            </Text>
          </View>
        </Card>
        
        <View style={styles.paymentForm}>
          <Text style={styles.formTitle}>Card Information</Text>
          
          <View style={styles.cardLogos}>
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1887&auto=format&fit=crop' }} 
              style={styles.cardLogo} 
              resizeMode="contain"
            />
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1887&auto=format&fit=crop' }} 
              style={styles.cardLogo} 
              resizeMode="contain"
            />
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1887&auto=format&fit=crop' }} 
              style={styles.cardLogo} 
              resizeMode="contain"
            />
          </View>
          
          <Input
            label="Card Number"
            placeholder="1234 5678 9012 3456"
            value={cardNumber}
            onChangeText={handleCardNumberChange}
            keyboardType="number-pad"
            maxLength={19}
            error={errors.cardNumber}
          />
          
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Input
                label="Expiry Date"
                placeholder="MM/YY"
                value={expiryDate}
                onChangeText={handleExpiryDateChange}
                keyboardType="number-pad"
                maxLength={5}
                error={errors.expiryDate}
              />
            </View>
            
            <View style={styles.halfInput}>
              <Input
                label="CVV"
                placeholder="123"
                value={cvv}
                onChangeText={setCvv}
                keyboardType="number-pad"
                maxLength={4}
                error={errors.cvv}
              />
            </View>
          </View>
          
          <Input
            label="Name on Card"
            placeholder="Enter name as it appears on card"
            value={name}
            onChangeText={setName}
            error={errors.name}
          />
          
          <View style={styles.secureNote}>
            <Lock size={16} color={colors.textLight} />
            <Text style={styles.secureText}>
              Your payment information is secure and encrypted
            </Text>
          </View>
        </View>
      </ScrollView>
      
      <View style={styles.footer}>
        <Button
          title={`Pay $${(subscription?.price || 0).toFixed(2)}/month`}
          onPress={handlePayment}
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
  summaryCard: {
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textLight,
  },
  summaryValue: {
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
  paymentForm: {
    marginTop: 8,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  cardLogos: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  cardLogo: {
    width: 40,
    height: 25,
    marginRight: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    width: '48%',
  },
  secureNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  secureText: {
    fontSize: 12,
    color: colors.textLight,
    marginLeft: 8,
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