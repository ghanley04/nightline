import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { StatusBar } from 'expo-status-bar';
import { RefreshCw, UserPlus } from 'lucide-react-native';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import colors from '@/constants/colors';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import { useRouter } from 'expo-router';
import { get } from 'aws-amplify/api';
// import API from 'aws-amplify';


const API_URL = 'https://myo31jt5y9.execute-api.us-east-2.amazonaws.com/dev/'; // replace with your endpoint

export default function PassScreen() {
  const { user } = useAuthenticator(ctx => [ctx.user]);
  const { subscription, guestPasses } = useSubscriptionStore();
  const router = useRouter();

  // const client = generateClient();
  const [passes, setPasses] = useState<{ id: string; tokenId: string }[]>([]);
  const [qrPayloads, setQrPayloads] = useState<{ [key: string]: string }>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  };

  // ------------------------
  // Fetch membership tokens
  // ------------------------

  const fetchMembershipTokens = useCallback(async () => {
    if (!user) {
      setIsRefreshing(false);
      return;
    }

    try {
      setIsRefreshing(true);
      setError(null);

      const restOperation = get({
        apiName: 'apiNightline',
        path: 'fetchMembership',
        options: {
          queryParams: { userId: user.userId }
        }
      });

      const { body } = await restOperation.response;
      const rawData = await body.json();

      // Cast raw JSON to MembershipResponse
      const data = rawData as unknown as MembershipResponse;

      // Now cast the parsed JSON
      // const data = jsonData as unknown as MembershipResponse;
      console.log('Fetched membership data:', data);

      if (!mounted.current) return;
      if (data.hasMembership && data.tokens && data.tokens.length > 0) {
        const primaryToken = data.tokens[0];
        setPasses([{
          id: 'primary',
          tokenId: primaryToken.token_id,
        }]);
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

  // ------------------------
  // Rotate QR codes hourly
  // ------------------------
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
      const res = await fetch(`${API_URL}/createInvite?userId=${user.userId}`);
      const data = await res.json();
      if (data.inviteLink) alert(`Invite your guest: ${data.inviteLink}`);
    } catch (err) {
      console.error(err);
    }
  };

  // ------------------------
  // Render
  // ------------------------
  if (!subscription) {
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

  if (isRefreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10 }}>Loading your pass...</Text>
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

      {passes.map(p => (
        <Card key={p.id} style={styles.passCard}>
          <Text style={styles.passTitle}>Night Line Boarding Pass</Text>
          <View style={styles.qrContainer}>
            {qrPayloads[p.id] ? <QRCode value={qrPayloads[p.id]} size={180} /> : <ActivityIndicator size="large" />}
          </View>
          <Text style={styles.passUserName}>{user?.username}</Text>
          <Text style={styles.passSubtitle}>Valid for entry & shuttle access</Text>

          <TouchableOpacity style={styles.refreshButton} onPress={handleRefreshPass} disabled={isRefreshing}>
            <RefreshCw size={16} color={colors.primary} style={isRefreshing ? styles.rotating : undefined} />
            <Text style={styles.refreshText}>{isRefreshing ? 'Refreshing...' : 'Refresh Pass'}</Text>
          </TouchableOpacity>
        </Card>
      ))}

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

// ------------------------
// Styles
// ------------------------
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