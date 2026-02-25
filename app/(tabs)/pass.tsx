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
import { MembershipResponse, InviteResponse } from '../interfaces/interface';

export default function PassScreen() {
  const { user } = useAuthenticator(ctx => [ctx.user]);
  const { subscription, guestPasses } = useSubscriptionStore();
  const router = useRouter();

  const [passes, setPasses] = useState<{ groupId: string; id: string; tokenId: string }[]>([]);
  const [qrPayloads, setQrPayloads] = useState<{ [key: string]: string }>({});
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchMembershipTokens = useCallback(async () => {
    const token = await getJwtToken();
    if (!user) { setIsRefreshing(false); return; }
    try {
      setError(null);
      const response = await get({
        apiName: "apiNightline",
        path: "/fetchMembership",
        options: { queryParams: { userId: user.userId } },
      });
      const { body } = await response.response;
      const rawData = await body.json();
      const data = rawData as unknown as MembershipResponse;

      if (!mounted.current) return;
      if (data.hasMembership && data.tokens && data.tokens.length > 0) {
        const formatted = data.tokens
          .filter(t => t.active)
          .map((t, i) => ({ id: `token-${i}`, tokenId: t.token_id, groupId: t.group_id, active: t.active }));
        setPasses(formatted);
        setLoadingSubscription(false);
        if (formatted.length === 0) {
          setError('Membership active but no active pass tokens found. Please contact support.');
        }
      } else if (data.hasMembership && data.tokens && data.tokens.length === 0) {
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
    const backendInterval = setInterval(fetchMembershipTokens, 24 * 60 * 60 * 1000);
    return () => { clearInterval(backendInterval); mounted.current = false; };
  }, [fetchMembershipTokens]);

  useEffect(() => {
    if (passes.length === 0) return;
    const updateQRCodes = () => {
      const newPayloads: { [key: string]: string } = {};
      passes.forEach(p => { newPayloads[p.id] = `${p.tokenId}:${Date.now()}`; });
      setQrPayloads(newPayloads);
    };
    updateQRCodes();
    const interval = setInterval(updateQRCodes, 60 * 60 * 1000);
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
        options: { queryParams: { userId: user.userId } },
      });
      const { body } = await response.response;
      const data = (await body.json()) as InviteResponse;
      if (data?.inviteLink) alert(`Invite your guest: ${data.inviteLink}`);
    } catch (err) {
      console.error(err);
    }
  };

  const getPassType = (groupId: string) => {
    if (!groupId) return 'Unknown';
    const prefix = groupId.slice(0, 3).toLowerCase();
    switch (prefix) {
      case 'ind': return 'Individual Pass';
      case 'nig': return 'Night Pass';
      case 'gre': return 'Greek Pass';
      case 'gro': return 'Group Pass';
      default:    return 'Unknown Pass';
    }
  };

  if (isRefreshing || loadingSubscription) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your pass...</Text>
      </View>
    );
  }

  if (!subscription && passes.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>🎟</Text>
        </View>
        <Text style={styles.emptyTitle}>No Active Subscription</Text>
        <Text style={styles.emptyText}>
          Subscribe to access your digital pass and Nightline shuttle services.
        </Text>
        <Button
          title="View Plans"
          onPress={() => router.push('/plans')}
          style={styles.emptyButton}
          size="large"
        />
      </View>
    );
  }

  if (passes.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Pass Available</Text>
        <Text style={styles.emptyText}>
          Unable to load your membership pass. Please try refreshing.
        </Text>
        <Button
          title="Refresh"
          onPress={handleRefreshPass}
          style={styles.emptyButton}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar style="light" />

      {passes.map((p) => (
        <DigitalPass
          key={p.id}
          id={p.id}
          passType={getPassType(p.groupId)}
          username={user.username}
          qrPayload={qrPayloads[p.id]}
          isRefreshing={isRefreshing}
          onRefresh={handleRefreshPass}
        />
      ))}

      {guestPasses.length > 0 && (
        <View style={styles.guestSection}>
          <View style={styles.guestHeader}>
            <Text style={styles.sectionTitle}>Guest Passes</Text>
            <TouchableOpacity style={styles.inviteButton} onPress={handleInviteGuest}>
              <UserPlus size={15} color={colors.primary} />
              <Text style={styles.inviteText}>Invite Guest</Text>
            </TouchableOpacity>
          </View>

          <Card>
            {guestPasses.map((pass, i) => (
              <View key={pass.id}>
                <View style={styles.guestItem}>
                  <View>
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
                {i < guestPasses.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 15,
  },

  // Empty states
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.background,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyIconText: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 8,
    minWidth: 160,
  },

  // Guest passes
  guestSection: {
    marginTop: 8,
  },
  guestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inviteText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  guestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
  },
  guestName: {
    fontWeight: '600',
    color: colors.text,
    fontSize: 15,
    marginBottom: 2,
  },
  guestValidity: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  guestStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  guestStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  guestStatusText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
  },
});