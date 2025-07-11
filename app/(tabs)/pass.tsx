import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { UserPlus, RefreshCw } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import DigitalPass from '@/components/DigitalPass';
import Card from '@/components/Card';
import Button from '@/components/Button';
import colors from '@/constants/colors';

export default function PassScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { subscription, guestPasses } = useSubscriptionStore();
  
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshPass = () => {
    setIsRefreshing(true);
    
    // Simulate refreshing pass
    setTimeout(() => {
      setIsRefreshing(false);
      Alert.alert('Pass Refreshed', 'Your digital pass has been refreshed.');
    }, 1000);
  };

  const handleInviteGuest = () => {
    if (!user?.subscriptionActive) {
      Alert.alert(
        'Subscription Required',
        'You need an active subscription to invite guests.',
        [
          { text: 'OK' },
          { 
            text: 'Get Subscription', 
            onPress: () => router.push('/subscription/plans') 
          }
        ]
      );
      return;
    }
    
    router.push('/guest/create');
  };

  const activeGuestPasses = guestPasses.filter((pass: { isUsed: any; }) => !pass.isUsed);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.content}>
        {user?.subscriptionActive ? (
          <>
            <View style={styles.passContainer}>
              <DigitalPass user={user} />
              
              <TouchableOpacity 
                style={styles.refreshButton}
                onPress={handleRefreshPass}
                disabled={isRefreshing}
              >
                <RefreshCw 
                  size={16} 
                  color={colors.primary} 
                  style={isRefreshing ? styles.rotating : undefined} 
                />
                <Text style={styles.refreshText}>
                  {isRefreshing ? 'Refreshing...' : 'Refresh Pass'}
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.subscriptionInfo}>
              <Text style={styles.sectionTitle}>Subscription Details</Text>
              
              <Card style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Plan:</Text>
                  <Text style={styles.infoValue}>
                    {subscription?.type === 'individual' ? 'Individual Plan' : 
                     subscription?.type === 'greek' ? 'Greek Life Plan' : 'Summer Plan'}
                  </Text>
                </View>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Price:</Text>
                  <Text style={styles.infoValue}>
                    ${subscription?.price.toFixed(2)}/month
                  </Text>
                </View>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Status:</Text>
                  <View style={styles.statusContainer}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>Active</Text>
                  </View>
                </View>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Expires:</Text>
                  <Text style={styles.infoValue}>
                    {new Date(user.subscriptionEndDate || '').toLocaleDateString()}
                  </Text>
                </View>
              </Card>
            </View>
            
            <View style={styles.guestSection}>
              <View style={styles.guestHeader}>
                <Text style={styles.sectionTitle}>Guest Passes</Text>
                <TouchableOpacity 
                  style={styles.inviteButton}
                  onPress={handleInviteGuest}
                >
                  <UserPlus size={16} color={colors.primary} />
                  <Text style={styles.inviteText}>Invite Guest</Text>
                </TouchableOpacity>
              </View>
              
              {activeGuestPasses.length > 0 ? (
                <Card style={styles.guestCard}>
                  {activeGuestPasses.map((pass: { id: React.Key | null | undefined; guestName: string | number | bigint | boolean | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | React.ReactPortal | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | null | undefined; validUntil: string | number | Date; }, index: any) => (
                    <View key={pass.id} style={styles.guestItem}>
                      <View style={styles.guestInfo}>
                        <Text style={styles.guestName}>{pass.guestName}</Text>
                        <Text style={styles.guestValidity}>
                          Valid until {new Date(pass.validUntil).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </Text>
                      </View>
                      <View style={styles.guestStatus}>
                        <View style={styles.guestStatusDot} />
                        <Text style={styles.guestStatusText}>Active</Text>
                      </View>
                    </View>
                  ))}
                </Card>
              ) : (
                <Text style={styles.noGuestsText}>
                  No active guest passes. Invite a guest for $5.
                </Text>
              )}
            </View>
          </>
        ) : (
          <View style={styles.noSubscriptionContainer}>
            <Text style={styles.noSubscriptionTitle}>No Active Subscription</Text>
            <Text style={styles.noSubscriptionText}>
              You don't have an active subscription. Subscribe to access Night Line shuttle services.
            </Text>
            <Button
              title="Get Subscription"
              onPress={() => router.push('/subscription/plans')}
              style={styles.subscribeButton}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  passContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 8,
  },
  refreshText: {
    marginLeft: 6,
    color: colors.primary,
    fontWeight: '500',
  },
  rotating: {
    transform: [{ rotate: '45deg' }],
  },
  subscriptionInfo: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  infoCard: {
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textLight,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.success,
  },
  guestSection: {
    marginBottom: 24,
  },
  guestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  inviteText: {
    marginLeft: 6,
    color: colors.primary,
    fontWeight: '500',
  },
  guestCard: {
    padding: 0,
  },
  guestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  guestInfo: {
    flex: 1,
  },
  guestName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  guestValidity: {
    fontSize: 12,
    color: colors.textLight,
  },
  guestStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '10', // 10% opacity
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  guestStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginRight: 4,
  },
  guestStatusText: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '500',
  },
  noGuestsText: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: 16,
  },
  noSubscriptionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noSubscriptionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  noSubscriptionText: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: 24,
  },
  subscribeButton: {
    width: '100%',
  },
});