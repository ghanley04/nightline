import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { get } from 'aws-amplify/api';
import colors from '@/constants/colors';

interface CognitoUser {
  username: string;
  email: string;
  phone: string;
  name: string;
  created_at: string;
  status: string;
}

interface GreekGroup {
  group_id: string;
  invite_code: string;
  invite_link: string;
  email: string;
  first_name: string;
  last_name: string;
  max_uses: number;
  current_uses: number;
  used: boolean;
  active: boolean;
  created_at: string;
  created_by: string;
  member_count: number;
  stripe_customer_id: string;   // ✅ added
  cognito_user: CognitoUser | null;
}

export default function DataScreen() {
  const [greekGroups, setGreekGroups] = useState<GreekGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await get({
        apiName: 'apiNightline',
        path: '/getDataAdmin',
        options: {},
      });
      const { body } = await raw.response;
      const data = await body.json() as unknown as { greekGroups: GreekGroup[] };
      setGreekGroups(data.greekGroups || []);
    } catch (err) {
      console.error('❌ [DATA] Error fetching admin data:', err);
      setError('Failed to load data. Check your permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCard = (inviteCode: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(inviteCode) ? next.delete(inviteCode) : next.add(inviteCode);
      return next;
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading greek memberships...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Greek Memberships</Text>
          <Text style={styles.topBarCount}>
            {greekGroups.length} membership{greekGroups.length !== 1 ? 's' : ''}
          </Text>
        </View>

        <View style={styles.list}>
          {greekGroups.length === 0 ? (
            <Text style={styles.emptyText}>No greek memberships found.</Text>
          ) : (
            greekGroups.map((group) => {
              const isExpanded = expandedCards.has(group.invite_code);

              const displayName = group.cognito_user?.name
                || `${group.first_name ?? ''} ${group.last_name ?? ''}`.trim()
                || group.email
                || '—';

              const displayEmail = group.cognito_user?.email || group.email || '—';

              return (
                <View key={group.invite_code} style={styles.card}>

                  {/* Card Header */}
                  <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => toggleCard(group.invite_code)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardHeaderLeft}>
                      <Text style={styles.cardTitle}>{displayName}</Text>
                      <Text style={styles.cardSubtitle}>
                        {displayEmail} · {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, group.active ? styles.statusActive : styles.statusInactive]}>
                      <Text style={[styles.statusText, group.active ? styles.statusTextActive : styles.statusTextInactive]}>
                        {group.active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.cardBody}>

                      {/* Cognito Account Info */}
                      {group.cognito_user && (
                        <>
                          <Text style={styles.sectionLabel}>Account</Text>
                          <View style={styles.infoGrid}>
                            <Row label="Name" value={group.cognito_user.name || '—'} />
                            <Row label="Email" value={group.cognito_user.email || '—'} />
                            <Row label="Phone" value={group.cognito_user.phone || '—'} />
                            <Row label="Username" value={group.cognito_user.username} mono />
                            <Row label="Status" value={group.cognito_user.status || '—'} />
                            <Row label="Account Created" value={group.cognito_user.created_at ? new Date(group.cognito_user.created_at).toLocaleDateString() : '—'} />
                          </View>
                        </>
                      )}

                      {/* Membership Info */}
                      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Membership</Text>
                      <View style={styles.infoGrid}>
                        <Row label="Group ID" value={group.group_id} mono />
                        <Row label="Stripe ID" value={group.stripe_customer_id || '—'} mono />
                        <Row label="Max Uses" value={String(group.max_uses ?? '—')} />
                        <Row label="Current Uses" value={String(group.current_uses ?? '—')} />
                        <Row label="Created By" value={group.created_by || '—'} mono />
                        <Row label="Created" value={group.created_at ? new Date(group.created_at).toLocaleDateString() : '—'} />
                      </View>

                      {/* Invite Code */}
                      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Invite</Text>
                      <View style={styles.inviteCard}>
                        <Row label="Code" value={group.invite_code} mono />
                        <Row label="Link" value={group.invite_link} mono />
                        <Row label="Used" value={group.used ? 'Yes' : 'No'} />
                      </View>

                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
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
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 10,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#0A0A0F',
    fontWeight: '700',
    fontSize: 14,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primary,
  },
  topBarCount: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  list: {
    padding: 20,
    gap: 16,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 12,
  },
  statusActive: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  statusInactive: {
    backgroundColor: colors.surfaceBorder,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#22c55e',
  },
  statusTextInactive: {
    color: colors.textSecondary,
  },
  cardBody: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  infoGrid: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  rowLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  rowValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '400',
    flex: 2,
    textAlign: 'right',
  },
  rowValueMono: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  inviteCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    gap: 4,
  },
});