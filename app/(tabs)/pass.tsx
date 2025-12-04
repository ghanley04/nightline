import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { UserPlus } from 'lucide-react-native';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import colors from '@/constants/colors';
import DigitalPass from '@/components/DigitalPass';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import { useRouter } from 'expo-router';
import { get } from 'aws-amplify/api';
import { getJwtToken } from "../auth/auth";

export default function PassScreen() {
  const { user } = useAuthenticator(ctx => [ctx.user]);
  const { subscription, guestPasses } = useSubscriptionStore();
  const router = useRouter();

  // const client = generateClient();
  const [passes, setPasses] = useState<{
    groupId: string; id: string; tokenId: string
  }[]>([]);
  const [qrPayloads, setQrPayloads] = useState<{ [key: string]: string }>({});
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  interface Token {
    token_id: string;
    user_id: string;
    group_id: string;
    // stripe_customer_id: string;
    // created_at: string;
    active: boolean;
  }

  type MembershipResponse = {
    tokens: Token[];
    hasMembership: boolean;
    tokenId?: string;
    groupId?: string;
  };

  type InviteResponse = {
    inviteLink?: string;
  };

  // Fetch membership tokens

  const fetchMembershipTokens = useCallback(async () => {
    const token = await getJwtToken();
    // setIsRefreshing(true);

    if (!user) {
      setIsRefreshing(false);
      return;
    }
    console.log("Checking User:", user);
    try {
      setError(null);

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
      console.log('Fetched membership data:', data);

      if (!mounted.current) return;
      if (data.hasMembership && data.tokens && data.tokens.length > 0) {
        const formatted = data.tokens.map((t, i) => ({
          id: `token-${i}`,
          tokenId: t.token_id,
          groupId: t.group_id,
        }));

        setPasses(formatted);
        setLoadingSubscription(false);
        //set subscription obj

      } else if (data.hasMembership && data.tokens && data.tokens.length === 0) {
        console.warn('Membership found but no tokens available');
        setPasses([]);
        setError('Membership active but no pass tokens found. Please contact support.');
      } else {
        setPasses([]);
      }
    } catch (err) {
      console.error('Error fetching membership token:', err);
      if (mounted.current) {
        setPasses([]);
        setError('Failed to load your pass. Please try again.');
      }
    } finally {
      if (mounted.current) {
        setIsRefreshing(false);
        setLoadingSubscription(false);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchMembershipTokens();
    const backendInterval = setInterval(fetchMembershipTokens, 24 * 60 * 60 * 1000); // 24h refresh
    return () => {
      clearInterval(backendInterval);
      mounted.current = false;
    };
  }, [fetchMembershipTokens]);

  // Rotate QR codes hourly
  useEffect(() => {
    if (passes.length === 0) return;

    const updateQRCodes = () => {
      const newPayloads: { [key: string]: string } = {};
      passes.forEach(p => {
        newPayloads[p.id] = `${p.tokenId}:${Date.now()}`;
      });
      setQrPayloads(newPayloads);
    };

    updateQRCodes(); // initial
    const interval = setInterval(updateQRCodes, 60 * 60 * 1000); // every hour

    return () => clearInterval(interval);
  }, [passes]);

  const handleRefreshPass = () => {
    setIsRefreshing(true);
    fetchMembershipTokens().finally(() => setIsRefreshing(false));
  };



  const handleInviteGuest = async () => {
    try {
      const response = await get({
        apiName: "apiNightline",
        path: "/createInvite",
        options: {
          queryParams: { userId: user.userId },
        },
      });

      const { body } = await response.response;
      const data = (await body.json()) as InviteResponse;

      if (data?.inviteLink) alert(`Invite your guest: ${data.inviteLink}`);
    } catch (err) {
      console.error(err);
    }
  };

  //Get pass type to display on pass
  const getPassType = (groupId: string) => {
    if (!groupId) return 'Unknown';

    const prefix = groupId.slice(0, 3).toLowerCase(); // first 3 letters

    switch (prefix) {
      case 'ind':
        return 'Individual Pass';
      case 'nig':
        return 'Night Pass';
      case 'gre':
        return 'Greek Pass';
      default:
        return 'Unknown Pass';
    }
  };

  if (isRefreshing || loadingSubscription) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10 }}>Loading your pass...</Text>
      </View>
    );
  }
  // Render
  if (!subscription && passes.length === 0) {
    return (
      <View style={styles.noSubscriptionContainer}>
        <Text style={styles.noSubscriptionTitle}>No Active Subscription</Text>
        <Text style={styles.noSubscriptionText}>
          Subscribe to access your digital pass and Night Line shuttle services.
        </Text>
        <Button
          title="Get Subscription"
          onPress={() => router.push('/plans')}
          style={styles.subscribeButton}
        />
      </View>
    );
  }



  if (passes.length === 0) {
    return (
      <View style={styles.noSubscriptionContainer}>
        <Text style={styles.noSubscriptionTitle}>No Pass Available</Text>
        <Text style={styles.noSubscriptionText}>
          Unable to load your membership pass. Please try refreshing.
        </Text>
        <Button
          title="Refresh"
          onPress={handleRefreshPass}
          style={styles.subscribeButton}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <StatusBar style="dark" />

      {passes.map((p, i) => {
        const token = p.tokenId;
        const passType = getPassType(p.groupId);

        return (
          <DigitalPass
            key={p.id}
            id={p.id}
            passType={getPassType(p.groupId)}
            username={user.username}
            qrPayload={qrPayloads[p.id]}
            isRefreshing={isRefreshing}
            onRefresh={handleRefreshPass}
          />

        );
      })}

      {guestPasses.length > 0 && (
        <View style={styles.guestSection}>
          <View style={styles.guestHeader}>
            <Text style={styles.sectionTitle}>Guest Passes</Text>
            <TouchableOpacity style={styles.inviteButton} onPress={handleInviteGuest}>
              <UserPlus size={16} color={colors.primary} />
              <Text style={styles.inviteText}>Invite Guest</Text>
            </TouchableOpacity>
          </View>

          <Card style={styles.guestCard}>
            {guestPasses.map(pass => (
              <View key={pass.id} style={styles.guestItem}>
                <View style={styles.guestInfo}>
                  <Text style={styles.guestName}>{pass.guestName}</Text>
                  <Text style={styles.guestValidity}>
                    Valid until {new Date(pass.validUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={styles.guestStatus}>
                  <View style={styles.guestStatusDot} />
                  <Text style={styles.guestStatusText}>Active</Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  passCard: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 20,
  },
  passTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  qrContainer: { backgroundColor: '#fff', padding: 10, borderRadius: 12, marginBottom: 10 },
  passUserName: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  passSubtitle: { fontSize: 13, color: '#777', marginTop: 2 },
  refreshButton: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  refreshText: { color: colors.primary, marginLeft: 6, fontWeight: '500' },
  rotating: { transform: [{ rotate: '360deg' }] },

  // Subscription Info
  subscriptionInfo: { marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  infoCard: { padding: 12, borderRadius: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  infoLabel: { color: '#666' },
  infoValue: { fontWeight: '500' },
  statusContainer: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'green', marginRight: 5 },
  statusText: { color: 'green' },

  // Guest Passes
  guestSection: { marginTop: 20 },
  guestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inviteButton: { flexDirection: 'row', alignItems: 'center' },
  inviteText: { color: colors.primary, marginLeft: 4 },
  guestCard: { padding: 12, borderRadius: 10, marginTop: 10 },
  guestItem: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  guestInfo: {},
  guestName: { fontWeight: '500' },
  guestValidity: { color: '#777' },
  guestStatus: { flexDirection: 'row', alignItems: 'center' },
  guestStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'green', marginRight: 5 },
  guestStatusText: { color: 'green' },
  noGuestsText: { textAlign: 'center', color: '#888', marginTop: 10 },

  // No Subscription
  noSubscriptionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  noSubscriptionTitle: { fontSize: 20, fontWeight: '600', marginBottom: 10 },
  noSubscriptionText: { textAlign: 'center', color: '#555', marginBottom: 20 },
  subscribeButton: { marginTop: 10 },
});