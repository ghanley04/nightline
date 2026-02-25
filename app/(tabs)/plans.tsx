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
import { useFocusEffect } from '@react-navigation/native';
import { TextInput } from 'react-native';

export default function SubscriptionPlansScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'one-time' | 'subscription'>('subscription');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [hasGroup, setHasGroup] = useState(false);
  const [hasIndividual, setHasIndividual] = useState(false);
  const [hasGreek, setHasGreek] = useState(false);
  const [hasOther, setHasOther] = useState(false);
  const { user } = useAuthenticator(ctx => [ctx.user]);
  const [hasNight, setHasNight] = useState(false);
  const [hasBus, setHasBus] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>('');

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
          }
          if (groupId.startsWith("night")) {
            console.log('🎫 [FETCH_MEMBERSHIP] Setting hasNight = true');
            setHasNight(true);
          }
          if (groupId.startsWith("bus")) {
            console.log('🎫 [FETCH_MEMBERSHIP] Setting hasBus = true');
            setHasBus(true);
          } else {
            console.log('🎫 [FETCH_MEMBERSHIP] Setting hasOther = true');
            setHasOther(true);
          }
        });
      } else {
        console.log('🎫 [FETCH_MEMBERSHIP] No valid tokens, resetting all flags');
        setHasGreek(false);
        setHasGroup(false);
        setHasIndividual(false);
        setHasNight(false);
        setHasBus(false);
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

  useFocusEffect(
    useCallback(() => {
      console.log('📱 [FOCUS] Plans screen focused, refreshing membership...');
      fetchMembershipTokens();
    }, [fetchMembershipTokens])
  );

  // ✅ NEW: Function to check if subscribing to this plan will replace an existing subscription
  const checkSubscriptionConflict = (planName: string): { hasConflict: boolean; message: string } => {
    const lowerPlanName = planName.toLowerCase();

    // Check if buying an individual plan while having individual
    if (lowerPlanName.includes('individual') && hasIndividual) {
      return {
        hasConflict: true,
        message: 'You already have an Individual subscription. Subscribing to this plan will replace your current Individual subscription.'
      };
    }

    // Check if buying a group plan while having group
    if (lowerPlanName.includes('group') && hasGroup) {
      return {
        hasConflict: true,
        message: 'You already have a Group subscription. Subscribing to this plan will replace your current Group subscription.'
      };
    }

    // Check if buying individual while having group or vice versa
    if (lowerPlanName.includes('individual') && hasGroup) {
      return {
        hasConflict: true,
        message: 'You currently have a Group subscription. Switching to Individual will cancel your Group subscription and all members will lose access.'
      };
    }

    if (lowerPlanName.includes('group') && hasIndividual) {
      return {
        hasConflict: true,
        message: 'You currently have an Individual subscription. Switching to Group will cancel your Individual subscription.'
      };
    }

    return { hasConflict: false, message: '' };
  };

  async function createCheckoutSession(priceId: string, planName: string) {
    console.log('💳 [CHECKOUT] ========== STARTING CHECKOUT SESSION ==========');
    console.log('💳 [CHECKOUT] priceId:', priceId);
    console.log('💳 [CHECKOUT] planName:', planName);

    // ✅ NEW: Check for subscription conflicts
    const conflict = checkSubscriptionConflict(planName);

    if (conflict.hasConflict) {
      // Show warning dialog
      Alert.alert(
        'Subscription Change',
        conflict.message + '\n\nDo you want to continue?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              console.log('💳 [CHECKOUT] User cancelled due to subscription conflict');
            }
          },
          {
            text: 'Continue',
            style: 'destructive',
            onPress: () => {
              console.log('💳 [CHECKOUT] User accepted subscription change');
              proceedWithCheckout(priceId, planName);
            }
          }
        ]
      );
      return; // Don't proceed immediately
    }

    // No conflict, proceed directly
    proceedWithCheckout(priceId, planName);
  }

  // ✅ NEW: Separated checkout logic so it can be called after user confirms
  async function proceedWithCheckout(priceId: string, planName: string) {
    try {
      console.log('💳 [CHECKOUT] Setting isLoading to true');
      setIsLoading(true);
      setLoadingPlanId(priceId);

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
      const lowerPlanName = planName.toLowerCase();

      if (lowerPlanName.includes('greek')) {
        groupType = 'greek';
      } else if (lowerPlanName.includes('group')) {
        groupType = 'group';
      } else if (lowerPlanName.includes('night') || lowerPlanName.includes('pass')) {
        groupType = 'night';
      } else if (lowerPlanName.includes('bus')) {
        groupType = 'bus';
      }
      console.log('💳 [CHECKOUT] Plan name (lowercase):', planName.toLowerCase());
      console.log('💳 [CHECKOUT] Contains "night"?:', planName.toLowerCase().includes('night'));
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
      setLoadingPlanId(null);

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
            {
              text: "Copy Link", onPress: () => {
                // You can add clipboard functionality here if needed
                console.log('📋 [INVITE] Link copied');
              }
            },
            { text: "OK" }
          ]
        );
      }
    } catch (e) {
      console.error('❌ [INVITE] Error fetching invite link:', e);
    }
  };

  const handleJoinInvite = async () => {
    if (!inviteCode) {
      Alert.alert('Enter Invite Code', 'Please enter a valid invite code.');
      return;
    }

    try {
      setIsLoading(true);
      const currentUser = await getCurrentUser();
      const response = await post({
        apiName: 'apiNightline',
        path: '/acceptInvite',
        options: {
          body: {
            groupId: inviteCode,
            userId: currentUser.userId,
            userName: currentUser.username,
            email: currentUser.attributes?.email ?? null,
            phoneNumber: currentUser.attributes?.phone_number ?? null,
          },
        },
      });

      const { body } = await response.response;
      const result = await body.json() as { alreadyMember?: boolean, success?: boolean, message?: string };

      Alert.alert(
        result.alreadyMember ? "Already a Member" : "Joined Successfully",
        result.alreadyMember
          ? "You're already in this group."
          : "You've successfully joined the group!"
      );

      // Refresh membership
      await fetchMembershipTokens();
      setInviteCode('');
    } catch (err) {
      console.error('❌ [INVITE] Error joining invite:', err);
      Alert.alert('Error', 'Failed to join invite. Please check the code and try again.');
    } finally {
      setIsLoading(false);
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
                    <Button
                      title={loadingPlanId === plan.id ? "Loading..." : "Subscribe"}
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
                  )}
                </View>
              </View>
            );
          })}
        </View>
        {/* Invite Code Section */}


      </ScrollView>
      <View style={styles.inviteContainer}>
        <Text style={styles.inviteLabel}>Have an invite code?</Text>
        <TextInput
          style={styles.inviteInput}
          placeholder="Enter code here"
          value={inviteCode}
          onChangeText={setInviteCode}
        />
        <Button
          title="Join Group"
          onPress={handleJoinInvite}
          disabled={isLoading || !inviteCode}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // Tab switcher
  topBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  tabTextActive: {
    color: '#0A0A0F',
    fontWeight: '700',
    fontSize: 14,
  },

  // Plans list
  planList: {
    padding: 20,
    gap: 16,
  },
  planCard: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 16,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  planTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primary,
  },
  planPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  planContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  planDescription: {
    paddingVertical: 14,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  // Invite section
  inviteContainer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  inviteLabel: {
    color: colors.textSecondary,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  inviteInput: {
    width: '100%',
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteTitle: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  inviteButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  inviteButtonText: {
    color: '#0A0A0F',
    fontSize: 16,
    fontWeight: 'bold',
  },
});