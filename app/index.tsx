import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Bus } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import Button from '@/components/Button';
import colors from '@/constants/colors';

import { Amplify } from 'aws-amplify';
// Make sure the path to aws-exports.js is correct for your project structure
import config from './aws-exports'; 
Amplify.configure(config);

export default function WelcomeScreen() {
  const router = useRouter();
  const { isAuthenticated, isOnboarded } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      if (isOnboarded) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    }
  }, [isAuthenticated, isOnboarded]);

  const handleLogin = () => {
    router.push('/auth/login');
  };

  const handleSignUp = () => {
    router.push('/auth/signup');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[colors.secondary, '#222222']}
        style={styles.background}
      />
      
      <View style={styles.logoContainer}>
        <Bus size={60} color={colors.primary} />
        <Text style={styles.logoText}>Night Line</Text>
        <Text style={styles.logoSubtext}>COMO</Text>
      </View>
      
      <View style={styles.contentContainer}>
        <Text style={styles.title}>Your Campus Shuttle Service</Text>
        <Text style={styles.subtitle}>
          Safe, reliable transportation for Mizzou students, day and night
        </Text>
        
        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <View style={styles.featureDot} />
            <Text style={styles.featureText}>Live bus tracking</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureDot} />
            <Text style={styles.featureText}>Digital shuttle pass</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureDot} />
            <Text style={styles.featureText}>Affordable monthly plans</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.buttonContainer}>
        <Button 
          title="Sign Up" 
          onPress={handleSignUp} 
          variant="primary"
          style={styles.signupButton}
        />
        <Button 
          title="Log In" 
          onPress={handleLogin} 
          variant="outline"
          style={styles.loginButton}
          textStyle={styles.loginButtonText}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 80,
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.background,
    marginTop: 16,
  },
  logoSubtext: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '600',
    letterSpacing: 4,
  },
  contentContainer: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.background,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 32,
  },
  featureList: {
    marginTop: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 12,
  },
  featureText: {
    fontSize: 16,
    color: colors.background,
  },
  buttonContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  signupButton: {
    marginBottom: 16,
  },
  loginButton: {
    borderColor: colors.background,
  },
  loginButtonText: {
    color: colors.background,
  },
});