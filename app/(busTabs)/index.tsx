import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { post } from 'aws-amplify/api';
import { X, CheckCircle, XCircle } from 'lucide-react-native';
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
          [{ text: 'Scan Next', onPress: () => { setScanned(false); setLastResult(null); } }]
        );
      } else {
        Alert.alert(
          '❌ Invalid Pass',
          result.message || result.error || 'This pass is not valid',
          [{ text: 'Try Again', onPress: () => { setScanned(false); setLastResult(null); } }]
        );
      }
    } catch (err) {
      console.error('❌ [SCAN] Error validating token:', err);
      Alert.alert(
        'Error',
        'Failed to validate pass. Please try again.',
        [{ text: 'OK', onPress: () => { setScanned(false); setLastResult(null); } }]
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

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scan Ticket</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <X size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      >
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          <View style={styles.instructionContainer}>
            <Text style={styles.instructionText}>
              {validating ? 'Validating pass...' : scanned ? 'Processing...' : 'Position QR code within the frame'}
            </Text>
          </View>

          {lastResult && (
            <View style={[styles.resultContainer, lastResult.valid ? styles.validResult : styles.invalidResult]}>
              {lastResult.valid ? (
                <>
                  <CheckCircle size={40} color="#10b981" />
                  <Text style={styles.resultTitle}>Valid Pass</Text>
                  <Text style={styles.resultDetails}>{lastResult.userName || 'Guest'}</Text>
                  <Text style={styles.resultSubtitle}>{lastResult.passType || 'Pass'}</Text>
                </>
              ) : (
                <>
                  <XCircle size={40} color="#ef4444" />
                  <Text style={styles.resultTitle}>Invalid Pass</Text>
                  <Text style={styles.resultDetails}>
                    {lastResult.message || lastResult.error || 'Not authorized'}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>
      </CameraView>

      <View style={styles.bottomContainer}>
        {validating && <ActivityIndicator size="large" color={colors.primary} />}
        {scanned && !validating && (
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => { setScanned(false); setLastResult(null); }}
          >
            <Text style={styles.resetButtonText}>Scan Next Pass</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.bottomText}>
          {scanned ? 'Tap "Scan Next Pass" to continue' : 'Align the QR code within the frame to scan'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  closeButton: { padding: 8 },
  camera: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: { width: 280, height: 280, position: 'relative' },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: colors.primary },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  instructionContainer: { marginTop: 40, paddingHorizontal: 20 },
  instructionText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center', fontWeight: '500' },
  resultContainer: {
    position: 'absolute',
    bottom: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  validResult: { borderColor: '#10b981', borderWidth: 2 },
  invalidResult: { borderColor: '#ef4444', borderWidth: 2 },
  resultTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 12, color: '#000' },
  resultDetails: { fontSize: 16, marginTop: 8, color: '#555', textAlign: 'center' },
  resultSubtitle: { fontSize: 14, marginTop: 4, color: '#777' },
  bottomContainer: {
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 30,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  resetButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  bottomText: { color: '#FFFFFF', fontSize: 14, textAlign: 'center', opacity: 0.8 },
  messageText: { fontSize: 18, color: '#FFFFFF', textAlign: 'center', marginTop: 12 },
  subText: { fontSize: 14, color: '#CCCCCC', textAlign: 'center', paddingHorizontal: 40, marginTop: 8 },
});