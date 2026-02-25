import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import colors from '@/constants/colors';

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
    <View key={id} style={styles.passCard}>
      {/* Gold header stripe */}
      <View style={styles.header}>
        <Text style={styles.brand}>NIGHTLINE</Text>
        <Text style={styles.passType}>{passType}</Text>
      </View>

      {/* QR code area */}
      <View style={styles.qrWrapper}>
        {qrPayload ? (
          <View style={styles.qrContainer}>
            <QRCode
              value={qrPayload}
              size={200}
              backgroundColor="#FFFFFF"
              color="#0A0A0F"
            />
          </View>
        ) : (
          <View style={styles.qrPlaceholder}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Generating pass...</Text>
          </View>
        )}
      </View>

      {/* User info */}
      <View style={styles.userInfo}>
        <Text style={styles.username}>{username}</Text>
        <Text style={styles.subtitle}>Valid for entry & shuttle access</Text>
      </View>

      {/* Divider with notches (ticket aesthetic) */}
      <View style={styles.dividerRow}>
        <View style={styles.notchLeft} />
        <View style={styles.dividerLine} />
        <View style={styles.notchRight} />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Columbia, MO · Nightline Transit</Text>
        {onRefresh && (
          <TouchableOpacity onPress={onRefresh} disabled={isRefreshing}>
            <Text style={[styles.refreshText, isRefreshing && styles.refreshing]}>
              {isRefreshing ? 'Refreshing...' : '↻ Refresh'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default DigitalPass;

const styles = StyleSheet.create({
  passCard: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: colors.shadowGold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    backgroundColor: colors.primary,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  brand: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 4,
    color: 'rgba(0,0,0,0.5)',
    marginBottom: 2,
  },
  passType: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0A0A0F',
    letterSpacing: 0.5,
  },
  qrWrapper: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  qrPlaceholder: {
    width: 232,
    height: 232,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },
  userInfo: {
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  username: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -1,
  },
  notchLeft: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.background,
    marginLeft: -9,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  notchRight: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.background,
    marginRight: -9,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  footerText: {
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  refreshText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  refreshing: {
    opacity: 0.5,
  },
});