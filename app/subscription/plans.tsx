import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import Button from '@/components/Button';
import colors from '@/constants/colors';
import { WebView } from 'react-native-webview';
import { StripeProvider } from '@stripe/stripe-react-native';
import { post } from 'aws-amplify/api';
import { v4 as uuidv4 } from 'uuid';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import { fetchUserAttributes, UserAttributeKey, getCurrentUser } from 'aws-amplify/auth';

export async function getUserAttributes() {
  try {
    const userAttributes = await fetchUserAttributes();
    console.log('User attributes fetched successfully:', userAttributes);
    return userAttributes;
  } catch (error) {
    console.error('Error fetching user attributes:', error);
    return null;
  }
}

interface Plan {
  id: string;
  name: string;
  description: string;
  amount: string;
  currency: string;
  interval: string;
  active: boolean;
}

export default function SubscriptionPlansScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setSubscription } = useSubscriptionStore();
  const [attributes, setAttributes] = useState<Partial<Record<UserAttributeKey, string>> | null>(null);
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const [inviteLink, setInviteLink] = useState(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<'individual' | 'greek' | 'summer' | null>(
    user?.userType === 'greek' ? 'greek' : 'individual'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');




  const handleSelectPlan = (plan: 'individual' | 'greek' | 'summer') => {
    setSelectedPlan(plan);
  };


  async function createCheckoutSession(priceId: string, planName: string) {
    // Get the Cognito user sub (unique ID)
    const user = await getCurrentUser();
    const userId = user.userId;
    console.log("Sending to backend:", { priceId, planName });


    let groupType = 'individual';
    if (planName.toLowerCase().includes('greek')) groupType = 'greek';
    else if (planName.toLowerCase().includes('group')) groupType = 'group';
    else if (planName.toLowerCase().includes('night')) groupType = 'night';
    //else if (planName.toLowerCase().includes('bus')) groupType = 'bus';

    const response = await fetch('https://myo31jt5y9.execute-api.us-east-2.amazonaws.com/dev/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: priceId,
        userId: userId, // or however you get it
        groupType: groupType
      }),
    });
    const text = await response.text();
    console.log("🔵 Raw backend response:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }

    console.log("🟣 Parsed backend response:", data);

    const checkoutUrl = data.url;
    const groupId = data.groupId; // <- returned from backend

    // Open Stripe Checkout in browser
    console.log('Backend returned:', data);
    console.log('Opening Stripe Checkout:', checkoutUrl);
    //if (checkoutUrl) Linking.openURL(checkoutUrl);
    ///else console.error('Checkout URL missing:', data);
    setCheckoutUrl(checkoutUrl);
    setGroupId(data.groupId);

    // You now have the userId and groupId on the frontend
    return { userId, groupId };
  }

  useEffect(() => {
    const fetchAndSetAttributes = async () => {
      // Only fetch attributes if the user is authenticated.
      if (authStatus === 'authenticated') {
        const userAttributes = await getUserAttributes();
        setAttributes(userAttributes);
      }
    };

    fetchAndSetAttributes();
  }, [authStatus]);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch('https://myo31jt5y9.execute-api.us-east-2.amazonaws.com/dev/get-plans');
        const data = await res.json();
        setPlans(Array.isArray(data) ? data : data.plans || []);
        console.log('Fetched plans:', data);

      } catch (err) {
        console.error('Error fetching plans:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const fetchInviteLink = async () => {
    try {
      const res = await fetch(
        `https://myo31jt5y9.execute-api.us-east-2.amazonaws.com/dev/get-invite-link?groupId=${groupId}`
      );
      const data = await res.json();
      if (data.inviteLink) setInviteLink(data.inviteLink);
    } catch (e) {
      console.error('Error fetching invite link:', e);
    }
  };

  // Call this after returning from Stripe success page
  useEffect(() => {
    // You might detect success via deep link or redirect page
    fetchInviteLink();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* <WebView
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={{ flex: 1 }}
      /> */}

      {/* <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your Plan</Text>
          <Text style={styles.subtitle}>
            Select a subscription plan that works for you
          </Text>
        </View> */}

      {/* <View style={styles.plansContainer}>
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
        </View> */}
      {/* </ScrollView>

      <View style={styles.footer}> */}


      {checkoutUrl ? (
        <WebView
          source={{ uri: checkoutUrl }}
          style={styles.webview}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onNavigationStateChange={(navState) => {
            // Detect when user finishes payment (e.g. Stripe success or cancel page)
            if (navState.url.includes('success')) {
              console.log('Payment success!');
              // You could close the WebView or navigate to a success screen
              setCheckoutUrl('');
              fetchInviteLink(); // optional
            } else if (navState.url.includes('cancel')) {
              console.log('Payment canceled.');
              setCheckoutUrl('');
            }
          }}
        />
      ) : (
        // Otherwise show your plan selection UI
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {plans
            .filter(plan => plan.active) // only show active products
            .map(plan => (
              <View key={plan.id} style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{plan.name}</Text>
                <Text>{plan.description}</Text>
                <Text>{plan.amount} {plan.currency} / {plan.interval}</Text>

                {plan.name.toLowerCase().includes('greek') ? (
                  <Text style={{ color: 'gray', marginTop: 8 }}>
                    Contact your admin to subscribe to this plan
                  </Text>
                ) : (
                  <Button
                    title="Subscribe"
                    onPress={() => createCheckoutSession(plan.id, plan.name)}
                  />
                )}
              </View>
            ))}
        </ScrollView>



      )}


      <Button
        title="Continue to Payment"
        onPress={() => createCheckoutSession("price_1SJE4XGwL1YVKp13lj4hDXgl", "individual")}
        disabled={!selectedPlan}
        loading={isLoading}
      />



      {/* <WebView
        source={{ uri: checkoutUrl }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      /> */}
      {/* </View> */}
    </View >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webview: {
    flex: 1,
    width: Dimensions.get('window').width,
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