import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import Button from '@/components/Button';
import colors from '@/constants/colors';
import { getCurrentUser } from 'aws-amplify/auth';
import { get, post } from 'aws-amplify/api';
import { Plan } from '../interfaces/plan';
import { MembershipResponse, InviteResponse } from '../interfaces/interface';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import { getJwtToken } from "../auth/auth";

export default function SubscriptionPlansScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'one-time' | 'subscription'>('subscription');
  const [isLoading, setIsLoading] = useState(false);
  const [hasGroup, setHasGroup] = useState(false);
  const [hasIndividual, setHasIndividual] = useState(false);
  const [hasGreek, setHasGreek] = useState(false);
  const [hasOther, setHasOther] = useState(false);
  const { user } = useAuthenticator(ctx => [ctx.user]);

  useEffect(() => {
    const fetchPlans = async () => {
      console.log('📋 [FETCH_PLANS] Starting to fetch plans...');
      try {
        const rawData = await get({
          apiName: 'apiNightline',
          path: '/get-plans',
          options: {},
        });
        console.log('📋 [FETCH_PLANS] Raw data received');
        const { body } = await rawData.response;
        const data = await body.json();
        console.log('📋 [FETCH_PLANS] Data parsed:', data);

        const newdata = data as unknown as Plan[];
        console.log('📋 [FETCH_PLANS] Plans count:', newdata.length);

        setPlans(newdata);
        console.log('📋 [FETCH_PLANS] Plans state updated successfully');
      } catch (err) {
        console.error('❌ [FETCH_PLANS] Error fetching plans:', err);
        console.error('❌ [FETCH_PLANS] Error details:', JSON.stringify(err, null, 2));
      } finally {
        setIsLoading(false);
        console.log('📋 [FETCH_PLANS] Finished (loading set to false)');
      }
    };

    fetchPlans();
  }, []);

  const fetchMembershipTokens = useCallback(async () => {
    console.log('🎫 [FETCH_MEMBERSHIP] Starting...');
    const token = await getJwtToken();
    console.log('🎫 [FETCH_MEMBERSHIP] JWT token obtained');

    if (!user) {
      console.log('🎫 [FETCH_MEMBERSHIP] No user found, exiting');
      setIsLoading(false);
      return;
    }
    console.log("🎫 [FETCH_MEMBERSHIP] Checking User:", user.userId);

    try {
      console.log('🎫 [FETCH_MEMBERSHIP] Making API call...');
      const response = await get({
        apiName: "apiNightline",
        path: "/fetchMembership",
        options: {
          queryParams: { userId: user.userId },
        },
      });

      console.log('🎫 [FETCH_MEMBERSHIP] Response received');
      const { body } = await response.response;
      const rawData = await body.json();

      console.log('🎫 [FETCH_MEMBERSHIP] Raw data:', rawData);
      const data = rawData as unknown as MembershipResponse;

      if (data.hasMembership && data.tokens && data.tokens.length > 0) {
        console.log('🎫 [FETCH_MEMBERSHIP] Processing', data.tokens.length, 'tokens');

        data.tokens.forEach((t, i) => {
          const groupId = t.group_id.toLowerCase();
          console.log(`🎫 [FETCH_MEMBERSHIP] Token ${i}: ${groupId}`);

          if (groupId.startsWith("group")) {
            console.log('🎫 [FETCH_MEMBERSHIP] Setting hasGroup = true');
            setHasGroup(true);
          }
          if (groupId.startsWith("individual")) {
            console.log('🎫 [FETCH_MEMBERSHIP] Setting hasIndividual = true');
            setHasIndividual(true);
          }
          if (groupId.startsWith("greek")) {
            console.log('🎫 [FETCH_MEMBERSHIP] Setting hasGreek = true');
            setHasGreek(true);
          } else {
            setHasOther(true);
          }
        });
      } else {
        console.log('🎫 [FETCH_MEMBERSHIP] No valid tokens, resetting all flags');
        setHasGreek(false);
        setHasGroup(false);
        setHasIndividual(false);
        setHasOther(false);
      }

      console.log('🎫 [FETCH_MEMBERSHIP] Completed successfully');
    } catch (err) {
      console.error('❌ [FETCH_MEMBERSHIP] Error:', err);
      console.error('❌ [FETCH_MEMBERSHIP] Error details:', JSON.stringify(err, null, 2));
    }
  }, [user]);

  useEffect(() => {
    console.log('🔄 [EFFECT] User changed, fetching membership tokens');
    fetchMembershipTokens();
  }, [user]);

  async function createCheckoutSession(priceId: string, planName: string) {
    console.log('💳 [CHECKOUT] ========== STARTING CHECKOUT SESSION ==========');
    console.log('💳 [CHECKOUT] priceId:', priceId);
    console.log('💳 [CHECKOUT] planName:', planName);

    try {
      console.log('💳 [CHECKOUT] Setting isLoading to true');
      setIsLoading(true);

      console.log('💳 [CHECKOUT] Getting current user...');
      const user = await getCurrentUser();
      console.log('💳 [CHECKOUT] User obtained:', user.userId);
      const userId = user.userId;

      if (!priceId) {
        console.error('❌ [CHECKOUT] priceId is missing!');
        throw new Error("priceId is required but was not provided");
      }

      console.log('💳 [CHECKOUT] Determining group type...');
      let groupType = 'individual';
      if (planName.toLowerCase().includes('greek')) groupType = 'greek';
      else if (planName.toLowerCase().includes('group')) groupType = 'group';
      else if (planName.toLowerCase().includes('night')) groupType = 'night';
      console.log('💳 [CHECKOUT] Group type determined:', groupType);

      console.log('💳 [CHECKOUT] Making POST request to create-checkout-session...');
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

      console.log('💳 [CHECKOUT] POST request completed, getting response...');
      const httpResponse = await response.response;
      console.log('💳 [CHECKOUT] HTTP Response status code:', httpResponse.statusCode);

      console.log('💳 [CHECKOUT] Reading response body as text...');
      const text = await httpResponse.body.text();
      console.log('💳 [CHECKOUT] Response text:', text);

      let data;
      try {
        console.log('💳 [CHECKOUT] Parsing JSON...');
        data = JSON.parse(text);
        console.log('💳 [CHECKOUT] Parsed data:', data);
      } catch (parseError) {
        console.error('❌ [CHECKOUT] JSON parse error:', parseError);
        throw new Error("Invalid response from server");
      }

      console.log('💳 [CHECKOUT] Checking for URL in response...');
      if (!data.url) {
        console.error('❌ [CHECKOUT] No URL in response! Data:', data);
        throw new Error("No checkout URL received from server");
      }

      console.log('💳 [CHECKOUT] URL found:', data.url);
      console.log('💳 [CHECKOUT] Group ID:', data.groupId);
      console.log('💳 [CHECKOUT] Setting group ID state...');
      setGroupId(data.groupId);

      console.log('🌐 [BROWSER] Opening in-app browser...');
      // Open Stripe checkout in in-app browser
      const result = await WebBrowser.openBrowserAsync(data.url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: colors.primary,
        toolbarColor: colors.secondary,
      });

      console.log('🌐 [BROWSER] Browser closed with type:', result.type);

      // After browser closes, refresh membership to see if payment completed
      if (result.type === 'dismiss' || result.type === 'cancel') {
        console.log('🌐 [BROWSER] User closed browser, refreshing membership...');
        await fetchMembershipTokens();
        
        // Check if we should fetch invite link
        if (data.groupId && 
            (data.groupId.toLowerCase().includes("group") || 
             data.groupId.toLowerCase().includes("greek"))) {
          console.log('🔗 [INVITE] Fetching invite link after checkout...');
          await fetchInviteLink(data.groupId);
        }
      }

      console.log('✅ [CHECKOUT] Checkout session completed!');

    } catch (error) {
      const err = error as any;
      console.error('❌ [CHECKOUT] ========== ERROR IN CHECKOUT SESSION ==========');
      console.error('❌ [CHECKOUT] Error type:', err?.constructor?.name);
      console.error('❌ [CHECKOUT] Error message:', err?.message);
      console.error('❌ [CHECKOUT] Full error object:', err);

      Alert.alert(
        "Subscription Error",
        `Unable to start checkout process. ${err?.message || 'Unknown error'}`,
        [{ text: "OK" }]
      );
    } finally {
      console.log('💳 [CHECKOUT] Setting isLoading to false');
      setIsLoading(false);
      console.log('💳 [CHECKOUT] ========== CHECKOUT SESSION ENDED ==========');
    }
  }

  const fetchInviteLink = async (targetGroupId?: string) => {
    const gId = targetGroupId || groupId;
    console.log('🔗 [INVITE] Fetching invite link for groupId:', gId);

    if (!gId) {
      console.log('🔗 [INVITE] No groupId, exiting');
      return;
    }

    if (!gId.toLowerCase().includes("group") && !gId.toLowerCase().includes("greek")) {
      console.log('🔗 [INVITE] GroupId does not include "group" or "greek", exiting');
      return;
    }

    try {
      console.log('🔗 [INVITE] Making API call...');
      const operation = await get({
        apiName: "apiNightline",
        path: "/get-invite-link",
        options: {
          queryParams: { groupId: gId },
        },
      });

      const { body } = await operation.response;
      const data = (await body.json()) as InviteResponse;
      console.log('🔗 [INVITE] Response data:', data);

      if (data.inviteLink) {
        console.log('🔗 [INVITE] Setting invite link:', data.inviteLink);
        setInviteLink(data.inviteLink);
        
        // Show the invite link to the user
        Alert.alert(
          "Group Created!",
          `Share this link with your group members:\n\n${data.inviteLink}`,
          [
            { text: "Copy Link", onPress: () => {
              // You can add clipboard functionality here if needed
              console.log('📋 [INVITE] Link copied');
            }},
            { text: "OK" }
          ]
        );
      }
    } catch (e) {
      console.error('❌ [INVITE] Error fetching invite link:', e);
    }
  };

  const filteredPlans = plans.filter(
    (plan) =>
      plan.active &&
      (selectedType === 'one-time' ? plan.interval === 'one-time' : plan.interval !== 'one-time')
  );

  console.log('🎨 [RENDER] Rendering with isLoading:', isLoading);
  console.log('🎨 [RENDER] Filtered plans count:', filteredPlans.length);

  if (isLoading && plans.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10, color: colors.text }}>Loading plans...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={[styles.tabButton, selectedType === 'one-time' && styles.tabButtonActive]}
            onPress={() => {
              console.log('🔘 [TAB] Switching to one-time');
              setSelectedType('one-time');
            }}
          >
            <Text style={selectedType === 'one-time' ? styles.tabTextActive : styles.tabText}>
              One-Time
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, selectedType === 'subscription' && styles.tabButtonActive]}
            onPress={() => {
              console.log('🔘 [TAB] Switching to subscription');
              setSelectedType('subscription');
            }}
          >
            <Text style={selectedType === 'subscription' ? styles.tabTextActive : styles.tabText}>
              Subscription
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.planList}>
          {filteredPlans.map((plan, index) => {
            console.log(`📦 [PLAN_${index}] Rendering plan:`, plan.name, 'ID:', plan.id);
            return (
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
                        title={isLoading ? "Loading..." : "Subscribe"}
                        onPress={() => {
                          console.log(`🔘 [BUTTON] Subscribe button pressed for plan:`, plan.name);
                          console.log(`🔘 [BUTTON] Plan ID being passed:`, plan.id);
                          if (!isLoading) {
                            createCheckoutSession(plan.id, plan.name);
                          } else {
                            console.log(`🔘 [BUTTON] Button press ignored - already loading`);
                          }
                        }}
                        disabled={isLoading}
                      />
                    )
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
    color: colors.text,
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
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
