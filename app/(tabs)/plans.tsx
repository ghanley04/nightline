import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Button from '@/components/Button';
import colors from '@/constants/colors';
import { getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth';
import { get, post } from 'aws-amplify/api';
import { Plan } from '../interfaces/plan';
import { MembershipResponse, InviteResponse } from '../interfaces/interface';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function SubscriptionPlansScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [membershipsLoading, setMembershipsLoading] = useState(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'one-time' | 'subscription'>('subscription');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const { user } = useAuthenticator(ctx => [ctx.user]);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  const [membershipFlags, setMembershipFlags] = useState({
    hasGroup: false,
    hasIndividual: false,
    hasGreek: false,
    hasOther: false,
    hasNight: false,
    hasBus: false,
  });

  const fetchPlans = useCallback(async () => {
    try {
      setPlansLoading(true);
      const rawData = await get({ apiName: 'apiNightline', path: '/get-plans', options: {} });
      const { body } = await rawData.response;
      const data = await body.json();
      setPlans(data as unknown as Plan[]);
    } catch (err) {
      console.error('❌ [FETCH_PLANS] Error fetching plans:', err);
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const fetchMembershipTokens = useCallback(async () => {
    if (!user?.userId) {
      setMembershipFlags({
        hasGroup: false,
        hasIndividual: false,
        hasGreek: false,
        hasOther: false,
        hasNight: false,
        hasBus: false,
      });
      setMembershipsLoading(false);
      return;
    }

    try {
      setMembershipsLoading(true);

      const response = await get({
        apiName: "apiNightline",
        path: "/fetchMembership",
        options: { queryParams: { userId: user.userId } },
      });

      const { body } = await response.response;
      const data = (await body.json()) as unknown as MembershipResponse;

      const nextFlags = {
        hasGroup: false,
        hasIndividual: false,
        hasGreek: false,
        hasOther: false,
        hasNight: false,
        hasBus: false,
      };

      if (data.hasMembership && data.tokens?.length) {
        data.tokens.forEach((t) => {
          const gid = t.group_id.toLowerCase();
          if (gid.startsWith("group")) nextFlags.hasGroup = true;
          else if (gid.startsWith("individual")) nextFlags.hasIndividual = true;
          else if (gid.startsWith("greek")) nextFlags.hasGreek = true;
          else if (gid.startsWith("night")) nextFlags.hasNight = true;
          else if (gid.startsWith("bus")) nextFlags.hasBus = true;
          else nextFlags.hasOther = true;
        });
      }

      setMembershipFlags(nextFlags);
    } catch (err) {
      console.error('❌ [FETCH_MEMBERSHIP] Error:', err);
    } finally {
      setMembershipsLoading(false);
    }
  }, [user?.userId]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    fetchMembershipTokens();
  }, [fetchMembershipTokens]);

  useFocusEffect(
    useCallback(() => {
      fetchMembershipTokens();
    }, [fetchMembershipTokens])
  );

  const checkSubscriptionConflict = (planName: string): { hasConflict: boolean; message: string } => {
    const n = planName.toLowerCase();

    if (n.includes('individual') && membershipFlags.hasIndividual) {
      return { hasConflict: true, message: 'You already have an Individual subscription. Subscribing to this plan will replace your current Individual subscription.' };
    }
    if (n.includes('group') && membershipFlags.hasGroup) {
      return { hasConflict: true, message: 'You already have a Group subscription. Subscribing to this plan will replace your current Group subscription.' };
    }
    if (n.includes('individual') && membershipFlags.hasGroup) {
      return { hasConflict: true, message: 'You currently have a Group subscription. Switching to Individual will cancel your Group subscription and all members will lose access.' };
    }
    if (n.includes('group') && membershipFlags.hasIndividual) {
      return { hasConflict: true, message: 'You currently have an Individual subscription. Switching to Group will cancel your Individual subscription.' };
    }

    return { hasConflict: false, message: '' };
  };

  async function createCheckoutSession(priceId: string, planName: string) {
    const conflict = checkSubscriptionConflict(planName);

    if (conflict.hasConflict) {
      Alert.alert('Subscription Change', conflict.message + '\n\nDo you want to continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => proceedWithCheckout(priceId, planName) },
      ]);
      return;
    }

    proceedWithCheckout(priceId, planName);
  }

  async function proceedWithCheckout(priceId: string, planName: string) {
    try {
      setIsLoading(true);
      setLoadingPlanId(priceId);

      const currentUser = await getCurrentUser();
      if (!priceId) throw new Error("priceId is required but was not provided");

      const n = planName.toLowerCase();
      let groupType = 'individual';

      if (n.includes('greek')) groupType = 'greek';
      else if (n.includes('group')) groupType = 'group';
      else if (n.includes('night') || n.includes('pass')) groupType = 'night';
      else if (n.includes('bus')) groupType = 'bus';

      const response = await post({
        apiName: "apiNightline",
        path: "/create-checkout-session",
        options: {
          body: { priceId, userId: currentUser.userId, groupType },
          headers: { "Content-Type": "application/json" },
        },
      });

      const text = await (await response.response).body.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid response from server");
      }

      if (!data.url) throw new Error("No checkout URL received from server");

      setGroupId(data.groupId);

      const redirectUrl = Linking.createURL('/');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: colors.primary,
        toolbarColor: colors.secondary,
      });

      if (result.type === 'success' || result.type === 'dismiss' || result.type === 'cancel') {
        await fetchMembershipTokens();

        if (data.groupId && (data.groupId.toLowerCase().includes("group") || data.groupId.toLowerCase().includes("greek"))) {
          await fetchInviteLink(data.groupId);
        }
      }
    } catch (error) {
      const err = error as any;
      Alert.alert("Subscription Error", `Unable to start checkout process. ${err?.message || 'Unknown error'}`, [{ text: "OK" }]);
    } finally {
      setIsLoading(false);
      setLoadingPlanId(null);
    }
  }

  const fetchInviteLink = async (targetGroupId?: string) => {
    const gId = targetGroupId || groupId;
    if (!gId || (!gId.toLowerCase().includes("group") && !gId.toLowerCase().includes("greek"))) return;

    try {
      const operation = await get({
        apiName: "apiNightline",
        path: "/get-invite-link",
        options: { queryParams: { groupId: gId } },
      });

      const data = (await (await operation.response).body.json()) as InviteResponse;

      if (data.inviteLink) {
        setInviteLink(data.inviteLink);
        Alert.alert("Group Created!", `Share this link with your group members:\n\n${data.inviteLink}`, [
          { text: "OK" },
        ]);
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
      const attributes = await fetchUserAttributes();

      const requestBody = {
        inviteCode,
        userId: currentUser.userId,
        userName: currentUser.username,
        email: attributes.email ?? null,
        phoneNumber: attributes.phone_number ?? null,
      };

      console.log('📤 [INVITE] request body:', JSON.stringify(requestBody, null, 2));

      const response = await post({
        apiName: 'apiNightline',
        path: '/accept-invite',
        options: { body: requestBody },
      });

      const httpResponse = await response.response;
      const rawText = await httpResponse.body.text();
      const result = JSON.parse(rawText) as {
        alreadyMember?: boolean;
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!result.success && !result.alreadyMember) {
        throw new Error(result.error || result.message || 'Join invite failed');
      }

      Alert.alert(
        result.alreadyMember ? 'Already a Member' : 'Joined Successfully',
        result.alreadyMember ? "You're already in this group." : "You've successfully joined the group!"
      );

      await fetchMembershipTokens();
      setInviteCode('');
      setInviteModalVisible(false);
    } catch (err: any) {
      console.error('❌ [INVITE] Error joining invite:', err);

      let errorMessage = err?.message || 'Failed to join invite. Please check the code and try again.';

      if (err?._response?.body) {
        try {
          const parsed =
            typeof err._response.body === 'string'
              ? JSON.parse(err._response.body)
              : err._response.body;
          errorMessage = parsed.error || parsed.message || parsed.details || errorMessage;
        } catch {}
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const renderPlanAction = (plan: Plan) => {
    const n = plan.name.toLowerCase();
    const isGreekPlan = n.includes('greek');
    const isNightOrBus = n.includes('night') || n.includes('bus');

    if (isGreekPlan) {
      return membershipFlags.hasGreek
        ? <Text style={styles.alreadyHaveText}>You already have this plan.</Text>
        : <Text style={styles.contactAdminText}>Contact your admin to subscribe to this plan.</Text>;
    }

    const alreadyHasThisPlan = !isNightOrBus && (
      (n.includes('individual') && membershipFlags.hasIndividual) ||
      (n.includes('group') && membershipFlags.hasGroup)
    );

    if (alreadyHasThisPlan) {
      return <Text style={styles.alreadyHaveText}>You already have this plan.</Text>;
    }

    return (
      <Button
        title={loadingPlanId === plan.id ? "Loading..." : n.includes('night') ? "Buy Pass" : n.includes('bus') ? "Request Rental" : "Subscribe"}
        onPress={() => { if (!isLoading) createCheckoutSession(plan.id, plan.name); }}
        disabled={isLoading}
      />
    );
  };

  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      if (!plan.active) return false;
      const isGreekPlan = plan.name.toLowerCase().includes('greek');

      if (selectedType === 'one-time') {
        if (isGreekPlan) return false;
        return plan.interval === 'one-time';
      }

      return plan.interval !== 'one-time';
    });
  }, [plans, selectedType]);

  if (plansLoading || membershipsLoading) {
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
            onPress={() => setSelectedType('one-time')}
          >
            <Text style={selectedType === 'one-time' ? styles.tabTextActive : styles.tabText}>One-Time</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, selectedType === 'subscription' && styles.tabButtonActive]}
            onPress={() => setSelectedType('subscription')}
          >
            <Text style={selectedType === 'subscription' ? styles.tabTextActive : styles.tabText}>Subscription</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.planList}>
          {filteredPlans.map((plan) => (
            <View key={plan.id} style={styles.planCard}>
              <View style={styles.planHeader}>
                <Text style={styles.planTitle}>{plan.name}</Text>
                <Text style={styles.planPrice}>{plan.amount} {plan.currency} / {plan.interval}</Text>
              </View>
              <View style={styles.planContent}>
                <Text style={styles.planDescription}>{plan.description}</Text>
                {renderPlanAction(plan)}
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.inviteLink} onPress={() => setInviteModalVisible(true)}>
          <Text style={styles.inviteLinkText}>Have an invite code?</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={inviteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setInviteModalVisible(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter Invite Code</Text>
            <Text style={styles.modalSubtitle}>Paste the code shared by your group admin.</Text>
            <TextInput
              style={styles.inviteInput}
              placeholder="Enter code here"
              placeholderTextColor={colors.textSecondary}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setInviteModalVisible(false);
                  setInviteCode('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <Button
                title={isLoading ? "Joining..." : "Join Group"}
                onPress={handleJoinInvite}
                disabled={isLoading || !inviteCode}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

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
  tabButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#0A0A0F', fontWeight: '700', fontSize: 14 },

  planList: { padding: 20, gap: 16 },
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
  planTitle: { fontSize: 17, fontWeight: '700', color: colors.primary },
  planPrice: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  planContent: { paddingHorizontal: 16, paddingBottom: 16 },
  planDescription: { paddingVertical: 14, color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  alreadyHaveText: { color: colors.textSecondary, marginTop: 8, fontSize: 14 },
  contactAdminText: { color: colors.textSecondary, marginTop: 8, fontSize: 14, fontStyle: 'italic' },

  inviteLink: { alignItems: 'center', paddingVertical: 16, paddingBottom: 32 },
  inviteLinkText: { color: colors.primary, fontSize: 14, fontWeight: '500', textDecorationLine: 'underline' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 32,
    elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 20 },
  inviteInput: {
    width: '100%',
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtons: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  cancelButtonText: { color: colors.textSecondary, fontWeight: '600', fontSize: 15 },
});