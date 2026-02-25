import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { post } from 'aws-amplify/api';
import { CheckCircle, XCircle } from 'lucide-react-native';
import colors from '@/constants/colors';

interface ValidationResponse {
  valid: boolean;
  userName?: string;
  passType?: string;
  groupId?: string;
  message?: string;
  error?: string;
}

export default function ScanTickets() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [validating, setValidating] = useState(false);
  const [lastResult, setLastResult] = useState<ValidationResponse | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const resetScan = () => {
    setScanned(false);
    setLastResult(null);
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || validating) return;

    setScanned(true);
    setValidating(true);

    try {
      const [tokenId, timestamp] = data.split(':');
      if (!tokenId) throw new Error('Invalid QR code format');

      const rawData = await post({
        apiName: 'apiNightline',
        path: '/validateToken',
        options: { body: { tokenId, timestamp: timestamp || Date.now().toString() } },
      });

      const { body } = await rawData.response;
      const json: unknown = await body.json();

      const isValidationResponse = (obj: any): obj is ValidationResponse =>
        obj && typeof obj.valid === 'boolean';
      const result: ValidationResponse = isValidationResponse(json)
        ? json
        : { valid: false, message: 'Invalid response from server' };

      setLastResult(result);

      if (result.valid) {
        Alert.alert(
          '✅ Valid Pass',
          `Welcome ${result.userName || 'Guest'}!\n${result.passType || 'Pass'} - ${result.groupId || ''}`,
          [{ text: 'Scan Next', onPress: resetScan }]
        );
      } else {
        Alert.alert(
          '❌ Invalid Pass',
          result.message || result.error || 'This pass is not valid',
          [{ text: 'Try Again', onPress: resetScan }]
        );
      }
    } catch (err) {
      console.error('❌ [SCAN] Error validating token:', err);
      Alert.alert(
        'Error',
        'Failed to validate pass. Please try again.',
        [{ text: 'OK', onPress: resetScan }]
      );
    } finally {
      setValidating(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.messageText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.messageText}>No access to camera</Text>
        <Text style={styles.subText}>Please enable camera permissions in your device settings.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      >
        {/* Dark vignette overlay */}
        <View style={styles.overlay}>

          {/* Top label */}
          <View style={styles.topLabel}>
            <Text style={styles.topLabelText}>
              {validating ? 'Validating...' : scanned ? 'Processing...' : 'Scan a Nightline Pass'}
            </Text>
          </View>

          {/* Scan frame */}
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />

            {/* Subtle inner glow when active */}
            {!scanned && (
              <View style={styles.scanInner} />
            )}
          </View>

          <Text style={styles.instructionText}>
            Align the QR code within the frame
          </Text>

          {/* Result card */}
          {lastResult && (
            <View style={[
              styles.resultContainer,
              lastResult.valid ? styles.validResult : styles.invalidResult,
            ]}>
              {lastResult.valid ? (
                <>
                  <CheckCircle size={36} color={colors.success} />
                  <Text style={[styles.resultTitle, { color: colors.success }]}>Valid Pass</Text>
                  <Text style={styles.resultName}>{lastResult.userName || 'Guest'}</Text>
                  <Text style={styles.resultPassType}>{lastResult.passType || 'Pass'}</Text>
                </>
              ) : (
                <>
                  <XCircle size={36} color={colors.error} />
                  <Text style={[styles.resultTitle, { color: colors.error }]}>Invalid Pass</Text>
                  <Text style={styles.resultName}>
                    {lastResult.message || lastResult.error || 'Not authorized'}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>
      </CameraView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {validating ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : scanned ? (
          <TouchableOpacity style={styles.scanNextButton} onPress={resetScan} activeOpacity={0.8}>
            <Text style={styles.scanNextText}>Scan Next Pass</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.bottomHint}>Hold steady — scanning automatically</Text>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: 12,
  },
  messageText: {
    fontSize: 17,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  subText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // Camera
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },

  // Top label
  topLabel: {
    position: 'absolute',
    top: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  topLabelText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Scan frame
  scanArea: {
    width: 260,
    height: 260,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: colors.primary,
  },
  topLeft:     { top: 0,    left: 0,  borderTopWidth: 4,    borderLeftWidth: 4  },
  topRight:    { top: 0,    right: 0, borderTopWidth: 4,    borderRightWidth: 4 },
  bottomLeft:  { bottom: 0, left: 0,  borderBottomWidth: 4, borderLeftWidth: 4  },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  scanInner: {
    width: 188,
    height: 188,
    borderRadius: 4,
    backgroundColor: colors.primaryGlow,
  },

  instructionText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Result card
  resultContainer: {
    position: 'absolute',
    bottom: 20,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 260,
    borderWidth: 1.5,
    gap: 6,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  validResult: {
    borderColor: colors.success,
    shadowColor: colors.success,
  },
  invalidResult: {
    borderColor: colors.error,
    shadowColor: colors.error,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  resultName: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  resultPassType: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    alignItems: 'center',
    minHeight: 90,
    justifyContent: 'center',
  },
  scanNextButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    shadowColor: colors.shadowGold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 4,
  },
  scanNextText: {
    color: '#0A0A0F',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  bottomHint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
});