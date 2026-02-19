import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { get } from 'aws-amplify/api';
import { getCurrentUser } from 'aws-amplify/auth';
import colors from '@/constants/colors';
import React from 'react';
import { MembershipResponse } from '../interfaces/interface';

export default function PaymentResult() {
  const { result, session_id } = useLocalSearchParams();
  const [status, setStatus] = useState<'checking' | 'success' | 'failed' | 'cancelled'>('checking');

  useEffect(() => {
    const verifyPayment = async () => {
      if (result === 'cancel') {
        setStatus('cancelled');
        await new Promise(resolve => setTimeout(resolve, 1000));
        router.replace('/(tabs)/plans');
        return;
      }

      if (result === 'success' && session_id) {
        console.log('✅ Payment completed, verifying...');
        console.log('🔑 Session ID:', session_id);
        
        // Give webhook 8 seconds to process (increased further)
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        try {
          // Get current user
          const user = await getCurrentUser();
          const userId = user.userId;
          
          console.log('🔍 Checking membership for user:', userId);
          
          // Check if membership was actually created
          const response = await get({
            apiName: "apiNightline",
            path: "/fetchMembership",
            options: {
              queryParams: { 
                userId: userId
              },
            },
          });
          
          const { body } = await response.response;
          const rawData = await body.json();
          
          console.log('📦 Full raw response:', JSON.stringify(rawData, null, 2));
          
          // Type cast the response
          const data = rawData as unknown as MembershipResponse;
          
          console.log('🎫 Has membership?', data.hasMembership);
          console.log('🎫 Token count:', data.tokens?.length || 0);
          console.log('🎫 Tokens:', data.tokens);
          
          // Check if webhook created the membership
          // For now, just check if hasMembership is true, regardless of token count
          if (data.hasMembership) {
            console.log('✅ Membership confirmed!');
            setStatus('success');
            
            // Redirect immediately without showing alert
            setTimeout(() => {
              router.replace('/(tabs)/plans');
            }, 1000);
            
          } else {
            console.warn('⚠️ No membership found after payment');
            console.warn('⚠️ Raw data was:', rawData);
            
            // Webhook might have failed
            setStatus('failed');
            Alert.alert(
              'Payment Processing',
              'Your payment was received, but activation is taking longer than expected. Please check back in a few minutes or contact support if this persists.',
              [
                { text: 'OK', onPress: () => router.replace('/(tabs)/plans') }
              ]
            );
          }
        } catch (error) {
          console.error('❌ Error verifying payment:', error);
          console.error('❌ Error details:', JSON.stringify(error, null, 2));
          setStatus('failed');
          Alert.alert(
            'Verification Error',
            'We couldn\'t verify your payment status. Please contact support with session ID: ' + session_id,
            [{ text: 'OK', onPress: () => router.replace('/(tabs)/plans') }]
          );
        }
      }
    };

    verifyPayment();
  }, [result, session_id]);

  return (
    <View style={styles.container}>
      {status === 'checking' && (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.title}>⏳ Verifying Payment...</Text>
          <Text style={styles.subtitle}>Please wait while we confirm your subscription</Text>
        </>
      )}
      
      {status === 'success' && (
        <>
          <Text style={styles.title}>✅ Success!</Text>
          <Text style={styles.subtitle}>Redirecting...</Text>
        </>
      )}
      
      {status === 'failed' && (
        <>
          <Text style={styles.title}>⚠️ Processing...</Text>
          <Text style={styles.subtitle}>This is taking longer than expected</Text>
        </>
      )}
      
      {status === 'cancelled' && (
        <>
          <Text style={styles.title}>❌ Cancelled</Text>
          <Text style={styles.subtitle}>Payment was cancelled</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginTop: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.text,
    marginTop: 10,
    textAlign: 'center',
  },
});
