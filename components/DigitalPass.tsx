import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { User } from '@/types';
import Card from './Card';
import colors from '@/constants/colors';

// Mock QR code image URL
const QR_CODE_URL = 'https://images.unsplash.com/photo-1595079676339-1534801ad6cf?q=80&w=2070&auto=format&fit=crop';

interface DigitalPassProps {
  user: User;
}

export const DigitalPass: React.FC<DigitalPassProps> = ({ user }) => {
  const getSubscriptionLabel = () => {
    switch (user.userType) {
      case 'individual':
        return 'Individual Plan';
      case 'greek':
        return 'Greek Life Plan';
      case 'guest':
        return 'Guest Pass';
      default:
        return 'No Active Plan';
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Night Line Pass</Text>
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: user.subscriptionActive ? colors.success : colors.error }]} />
          <Text style={styles.statusText}>{user.subscriptionActive ? 'Active' : 'Inactive'}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.userInfo}>
          {user.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>{user.name.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.userDetails}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.plan}>{getSubscriptionLabel()}</Text>
            <Text style={styles.school}>{user.schoolAffiliation}</Text>
          </View>
        </View>

        <View style={styles.qrContainer}>
          <Image source={{ uri: QR_CODE_URL }} style={styles.qrCode} />
          <Text style={styles.scanText}>Scan to board</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>ID: {user.id.substring(0, 8)}</Text>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.secondary,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.secondary,
  },
  content: {
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  photo: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  photoPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  photoPlaceholderText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  userDetails: {
    marginLeft: 16,
    justifyContent: 'center',
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  plan: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 4,
  },
  school: {
    fontSize: 14,
    color: colors.textLight,
  },
  qrContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  qrCode: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  scanText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textLight,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: colors.textLight,
  },
});

export default DigitalPass;