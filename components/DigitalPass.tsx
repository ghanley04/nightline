import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import colors from '@/constants/colors';
import { Card } from '@/components/Card';

interface DigitalPassProps {
  id: string;
  passType: string;
  username: string;
  qrPayload?: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

const DigitalPass: React.FC<DigitalPassProps> = ({
  id,
  passType,
  username,
  qrPayload,
  isRefreshing = false,
  onRefresh,
}) => {
  return (
    <Card key={id} style={styles.passCard}>
      <View style={styles.header}>
        <Text style={styles.passTitle}>{passType}</Text>
      </View>

      <View style={styles.qrContainer}>
        {qrPayload ? (
          <QRCode value={qrPayload} size={180} />
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
      </View>

      <Text style={styles.passUserName}>{username}</Text>
      <Text style={styles.passSubtitle}>Valid for entry & shuttle access</Text>

      {onRefresh && (
        <View style={styles.refreshContainer}>
          <Text
            style={[styles.refreshText, isRefreshing && styles.refreshing]}
            onPress={onRefresh}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Pass'}
          </Text>
        </View>
      )}
    </Card>
  );
};

export default DigitalPass;

const styles = StyleSheet.create({
  passCard: {
    width: '100%',
    borderRadius: 16,
    padding: 0,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 20,
    paddingBottom: 20,
  },
  passTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  header: {
    paddingTop: 24,
    paddingHorizontal: 16,
    borderTopEndRadius: 16,
    borderTopStartRadius: 16,
    backgroundColor: colors.primary,
    width: '100%',
    marginBottom: 20,
    textAlign: 'center',
  },
  qrContainer: {
    paddingHorizontal: 16,

    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  passUserName: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  passSubtitle: { fontSize: 13, color: '#777', marginTop: 2 },
  refreshContainer: { marginTop: 12 },
  refreshText: { color: colors.primary, fontWeight: '500' },
  refreshing: { opacity: 0.6 },
});
