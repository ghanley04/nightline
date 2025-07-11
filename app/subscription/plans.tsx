import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import SubscriptionCard from '@/components/SubscriptionCard';
import Button from '@/components/Button';
import colors from '@/constants/colors';

export default function SubscriptionPlansScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setSubscription } = useSubscriptionStore();
  
  const [selectedPlan, setSelectedPlan] = useState<'individual' | 'greek' | 'summer' | null>(
    user?.userType === 'greek' ? 'greek' : 'individual'
  );
  const [isLoading, setIsLoading] = useState(false);

  const isGreekMember = user?.userType === 'greek';
  const isSummerTime = new Date().getMonth() >= 4 && new Date().getMonth() <= 7; // May to August

  const handleSelectPlan = (plan: 'individual' | 'greek' | 'summer') => {
    setSelectedPlan(plan);
  };

  const handleContinue = () => {
    if (!selectedPlan) return;

    setIsLoading(true);

    // Get price based on plan
    let price = 32.99;
    if (selectedPlan === 'greek') price = 26.99;
    if (selectedPlan === 'summer') price = 5.00;

    // Create subscription object
    const subscription = {
      id: `sub-${Date.now()}`,
      userId: user?.id || '',
      type: selectedPlan,
      price,
      startDate: new Date().toISOString(),
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 9)).toISOString(),
      autoRenew: true,
      status: 'active' as const,
    };

    // Simulate API call
    setTimeout(() => {
      setSubscription(subscription);
      router.push('/subscription/payment');
      setIsLoading(false);
    }, 1000);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your Plan</Text>
          <Text style={styles.subtitle}>
            Select a subscription plan that works for you
          </Text>
        </View>
        
        <View style={styles.plansContainer}>
          <SubscriptionCard
            title="Individual Plan"
            price={32.99}
            features={[
              'Unlimited rides during service hours',
              '9-month subscription (academic year)',
              'Digital pass for easy boarding',
              'Live bus tracking',
              'Invite guests for $5 per ride'
            ]}
            isRecommended={!isGreekMember}
            onSelect={() => handleSelectPlan('individual')}
            isSelected={selectedPlan === 'individual'}
          />
          
          <SubscriptionCard
            title="Greek Life Plan"
            price={26.99}
            features={[
              'Discounted rate for fraternity/sorority members',
              'Unlimited rides during service hours',
              '9-month subscription (academic year)',
              'Digital pass for easy boarding',
              'Live bus tracking',
              'Invite guests for $5 per ride'
            ]}
            isRecommended={isGreekMember}
            onSelect={() => handleSelectPlan('greek')}
            isSelected={selectedPlan === 'greek'}
            disabled={!isGreekMember}
          />
          
          {isSummerTime && (
            <SubscriptionCard
              title="Summer Plan"
              price={5.00}
              features={[
                'Reduced summer rate (May-August)',
                'Unlimited rides during summer service hours',
                'Digital pass for easy boarding',
                'Live bus tracking',
                'Invite guests for $5 per ride',
                '$5/month discount for Fall if subscribed all summer'
              ]}
              onSelect={() => handleSelectPlan('summer')}
              isSelected={selectedPlan === 'summer'}
            />
          )}
        </View>
      </ScrollView>
      
      <View style={styles.footer}>
        <Button
          title="Continue to Payment"
          onPress={handleContinue}
          disabled={!selectedPlan}
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
  plansContainer: {
    marginTop: 16,
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