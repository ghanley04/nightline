import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import Button from '@/components/Button';
import colors from '@/constants/colors';
import { getCurrentUser, fetchUserAttributes, UserAttributeKey } from 'aws-amplify/auth';
import { get } from 'aws-amplify/api';
import { Plan } from '../interfaces/plan';
import { post } from 'aws-amplify/api';
import { MembershipResponse, InviteResponse } from '../interfaces/interface';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import { getJwtToken } from "../auth/auth";

export default function SubscriptionPlansScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'one-time' | 'subscription'>('subscription');
  const [isLoading, setIsLoading] = useState(false);
  const [hasGroup, setHasGroup] = useState(false);
  const [hasIndividual, setHasIndividual] = useState(false);
  const [hasGreek, setHasGreek] = useState(false);
  const [hasOther, setHasOther] = useState(false);
  const { user } = useAuthenticator(ctx => [ctx.user]);

  // 🔹 Fetch Stripe plans
  // useEffect(() => {
  //   const fetchPlans = async () => {
  //     try {
  //       const res = await fetch('APIURL/fetch-plans');
  //       const data = await res.json();
  //       setPlans(Array.isArray(data) ? data : data.plans || []);
  //     } catch (err) {
  //       console.error('Error fetching plans:', err);
  //     } finally {
  //       setIsLoading(false);
  //     }
  //   };
  //   fetchPlans();
  // }, []);
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const rawData = await get({
          apiName: 'apiNightline',
          path: '/get-plans',
          options: {
          },
        });
        const { body } = await rawData.response;
        const data = await body.json();
        //console.log("plan data", rawData);
        //console.log("plan data", data);

        const newdata = data as unknown as Plan[]; // adjust depending on actual structure
        //console.log("new data", newdata);

        setPlans(newdata);
      } catch (err) {
        console.error('Error fetching plans:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlans();
  }, []);


  // Fetch membership tokens

  const fetchMembershipTokens = useCallback(async () => {
    const token = await getJwtToken();
    // setIsRefreshing(true);

    if (!user) {
      setIsLoading(false);
      return;
    }
    console.log("Checking User:", user);
    try {
      //setError(null);

      const response = await get({
        apiName: "apiNightline",
        path: "/fetchMembership",
        options: {
          queryParams: { userId: user.userId },
        },
      });
      const { body } = await response.response;
      const rawData = await body.json();

      console.log('Lambda response:', body);
      console.log('Lambda response - raw data:', rawData);

      // Cast raw JSON to MembershipResponse
      const data = rawData as unknown as MembershipResponse;
      console.log('Fetched membership data in plans:', data);

      //if (!mounted.current) return;
      if (data.hasMembership && data.tokens && data.tokens.length > 0) {
        const formatted = data.tokens.map((t, i) => {
          const groupId = t.group_id.toLowerCase();
          if (groupId.startsWith("group")) {
            setHasGroup(true);
          }
          if (groupId.startsWith("individual")) {
            setHasIndividual(true);
          }
          if (groupId.startsWith("greek")) {
            setHasGreek(true);
          } else {
            setHasOther(true);
          }
        });

        //setPasses(formatted);
        //setLoadingSubscription(false);
        //set subscription obj

      } else if (data.hasMembership && data.tokens && data.tokens.length === 0) {
        console.warn('Membership found but no tokens available');
        setHasGreek(false);
        setHasGroup(false);
        setHasIndividual(false);
        setHasOther(false);
        //setError('Membership active but no pass tokens found. Please contact support.');
      } else {
        setHasGreek(false);
        setHasGroup(false);
        setHasIndividual(false);
        setHasOther(false);
      }
    } catch (err) {
      console.error('Error fetching membership token:', err);
      // if (mounted.current) {
      //   setPasses([]);
      //   setError('Failed to load your pass. Please try again.');
      // }
    } finally {
      // if (mounted.current) {
      //   setIsRefreshing(false);
      //   setLoadingSubscription(false);
      // }
    }

  }, [user]);
    fetchMembershipTokens();


  // Create checkout session
  async function createCheckoutSession(priceId: string, planName: string) {
    const user = await getCurrentUser();
    const userId = user.userId;
    console.log("Creating checkout session for:", priceId, planName);
    console.log("priceId value:", priceId);
    console.log("priceId type:", typeof priceId);
    console.log("priceId is undefined?", priceId === undefined);
    console.log("priceId is null?", priceId === null);
    console.log("planName:", planName);
    console.log("userId:", userId);

    if (!priceId) {
      throw new Error("priceId is required but was not provided");
    }
    let groupType = 'individual';
    if (planName.toLowerCase().includes('greek')) groupType = 'greek';
    else if (planName.toLowerCase().includes('group')) groupType = 'group';
    else if (planName.toLowerCase().includes('night')) groupType = 'night';


    const response = await post({
      apiName: "apiNightline",
      path: "/create-checkout-session",
      options: {
        body: {
          priceId,
          userId,
          groupType,
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    });

    // Amplify response format
    const httpResponse = await response.response;  // wait for the response object
    const text = await httpResponse.body.text();
    console.log("text:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }

    setCheckoutUrl(data.url);
    setGroupId(data.groupId);
  }

  // async function createCheckoutSession(priceId: string, planName: string) {
  //   try {
  //     const user = await getCurrentUser();
  //     const userId = user.userId;
  //     console.log("Creating checkout session for:", priceId, planName);

  //     let groupType = 'individual';
  //     if (planName.toLowerCase().includes('greek')) groupType = 'greek';
  //     else if (planName.toLowerCase().includes('group')) groupType = 'group';
  //     else if (planName.toLowerCase().includes('night')) groupType = 'night';

  //     const response = await post({
  //       apiName: "apiNightline",
  //       path: "/create-checkout-session",
  //       options: {
  //         body: {
  //           priceId,
  //           userId,
  //           groupType,
  //         },
  //         headers: {
  //           "Content-Type": "application/json",
  //         },
  //       },
  //     });

  //     console.log("Response object:", response);

  //     // Try to get the response
  //     try {
  //       const httpResponse = await response.response;
  //       console.log("HTTP Response received:", httpResponse);
  //       console.log("Status code:", httpResponse.statusCode);
  //       console.log("Headers:", httpResponse.headers);

  //       const body = await httpResponse.body.json(); // Try json() instead of text()
  //       console.log("Parsed body:", body);

  //       // If body has a body property (double-encoded), parse it
  //       const data = typeof body.body === 'string' ? JSON.parse(body.body) : body;
  //       console.log("Final data:", data);

  //       setCheckoutUrl(data.url);
  //       setGroupId(data.groupId);

  //     } catch (responseError) {
  //       console.error("Error reading response:", responseError);
  //       console.error("Response error details:", JSON.stringify(responseError, null, 2));
  //       throw responseError;
  //     }

  //   } catch (error) {
  //     console.error("Detailed error:", error);
  //     console.error("Error type:", error.constructor.name);
  //     console.error("Error message:", error.message);

  //     // Try to extract more details from Amplify error
  //     if (error.response) {
  //       console.error("Error response:", error.response);
  //     }
  //     if (error.underlyingError) {
  //       console.error("Underlying error:", error.underlyingError);
  //     }

  //     throw error;
  //   }
  // }


  // Fetch invite link after successful payment

  const fetchInviteLink = async () => {
    if (!groupId) return;

    if (!groupId.toLowerCase().includes("group") && !groupId.toLowerCase().includes("greek")) {
      return;
    }
    try {
      const operation = await get({
        apiName: "apiNightline",
        path: "/get-invite-link",
        options: {
          queryParams: { groupId },
        },
      });

      const { body } = await operation.response;
      const data = (await body.json()) as InviteResponse;

      if (data.inviteLink) {
        setInviteLink(data.inviteLink);
      }
    } catch (e) {
      console.error("Error fetching invite link:", e);
    }
  };

  //  Filter plans
  const filteredPlans = plans.filter(
    (plan) =>
      plan.active &&
      (selectedType === 'one-time' ? plan.interval === 'one-time' : plan.interval !== 'one-time')
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10 }}>Loading plans...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {checkoutUrl ? (
        <WebView
          source={{ uri: checkoutUrl }}
          style={styles.webview}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onNavigationStateChange={(navState) => {
            if (navState.url.includes('success')) {
              console.log('✅ Payment success!');
              setCheckoutUrl('');
              fetchInviteLink();
            } else if (navState.url.includes('cancel')) {
              console.log('❌ Payment canceled.');
              setCheckoutUrl('');
            }
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={[styles.tabButton, selectedType === 'one-time' && styles.tabButtonActive]}
              onPress={() => setSelectedType('one-time')}
            >
              <Text style={selectedType === 'one-time' ? styles.tabTextActive : styles.tabText}>
                One-Time
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, selectedType === 'subscription' && styles.tabButtonActive]}
              onPress={() => setSelectedType('subscription')}
            >
              <Text style={selectedType === 'subscription' ? styles.tabTextActive : styles.tabText}>
                Subscription
              </Text>
            </TouchableOpacity>
          </View>

          {/* 🔹 Plan listing */}
          <View style={styles.planList}>
            {filteredPlans.map((plan) => (
              <View key={plan.id} style={styles.planCard}>
                <View style={styles.planHeader}>
                  <Text style={styles.planTitle}>{plan.name}</Text>
                  <Text style={styles.planPrice}>
                    {plan.amount} {plan.currency} / {plan.interval}
                  </Text>
                </View>
                <View style={styles.planContent}>
                  <Text style={styles.planDescription}>{plan.description}</Text>
                  {plan.name.toLowerCase().includes('greek') ? (
                    hasGreek ? (
                      <Text style={{ color: 'gray', marginTop: 8 }}>
                        You already have this plan.
                      </Text>
                    ) : (
                      <Text style={{ color: 'gray', marginTop: 8 }}>
                        Contact your admin to subscribe to this plan.
                      </Text>
                    )
                  ) : (
                    plan.name.toLowerCase().includes('individual') && hasIndividual ? (
                      <Text style={{ color: 'gray', marginTop: 8 }}>
                        You already have an individual plan.
                      </Text>
                    ) : plan.name.toLowerCase().includes('group') && hasGroup ? (
                      <Text style={{ color: 'gray', marginTop: 8 }}>
                        You already have a group plan.
                      </Text>
                    ) : (
                      <Button
                        title="Subscribe"
                        onPress={() => createCheckoutSession(plan.id, plan.name)}
                      />
                    )
                  )}

                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )
      }
    </View >
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  webview: {
    flex: 1,
    width: Dimensions.get('window').width,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.textLight,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.text,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '600',
  },
  planList: {
    padding: 20,
  },
  planContent: {
    paddingHorizontal: 16,
  },
  planDescription: {
    paddingVertical: 16,
  },
  planCard: {
    marginBottom: 20,
    paddingBottom: 16,
    backgroundColor: colors.blacktint3,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: .1,
    shadowRadius: 6,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: colors.primary,

  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    backgroundColor: colors.secondary,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    paddingTop: 16,
    paddingHorizontal: 16,
    color: colors.primary,
  },
  planPrice: {
    marginVertical: 8,
    fontWeight: '500',
    color: colors.primary,

  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

});
