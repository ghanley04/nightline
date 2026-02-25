import 'react-native-url-polyfill/auto';

import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Authenticator, useAuthenticator, ThemeProvider } from '@aws-amplify/ui-react-native';
import { useColorScheme, StyleSheet, Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import colors from '../constants/colors';
import { LinearGradient } from "expo-linear-gradient";
import { fetchAuthSession, updateUserAttributes } from 'aws-amplify/auth';
import AppLinkHandler from '@/components/AppLinkHandler';
import * as Linking from 'expo-linking';
import { Amplify } from 'aws-amplify';
import { Hub } from 'aws-amplify/utils';
import config from '../src/aws-exports';

// URL.canParse polyfill
if (typeof URL !== 'undefined' && !URL.canParse) {
  URL.canParse = function (url, base) {
    try {
      new URL(url, base);
      return true;
    } catch {
      return false;
    }
  };
}

const redirectUrl = __DEV__
  ? Linking.createURL('/')
  : 'nightlineapp://';

console.log('AWS Config OAuth:', JSON.stringify((config as any).oauth));

const { oauth: _discard, ...configWithoutOauth } = config as any;

Amplify.configure({
  ...configWithoutOauth,
  oauth: {
    ...(config as any).oauth,
    redirectSignIn: redirectUrl,
    redirectSignOut: redirectUrl,
    responseType: 'code',
  }
});

console.log('Final redirect:', redirectUrl);
const currentConfig = Amplify.getConfig();
console.log('Final Amplify OAuth:', JSON.stringify(currentConfig));

Hub.listen('auth', ({ payload }) => {
  console.log('Auth event:', payload.event);
  if (payload.event) {
    console.log('Auth data:', JSON.stringify(payload.event));
  }
});

SplashScreen.preventAutoHideAsync();

// ─── Terms Modal ──────────────────────────────────────────────────────────────

function TermsModal({ onAccept }: { onAccept: () => void }) {
  return (
    <Modal visible transparent animationType="slide">
      <View style={termsStyles.overlay}>
        <View style={termsStyles.container}>
          <Text style={termsStyles.title}>Terms & Conditions</Text>
          <Text style={termsStyles.subtitle}>Please read and accept before continuing</Text>

          <ScrollView style={termsStyles.scrollView}>
            <Text style={termsStyles.sectionTitle}>1. Introduction & Acceptance of Terms</Text>
            <Text style={termsStyles.body}>
              By creating an account or using the NightLine COMO mobile app or website, you agree to these Terms & Conditions. If you do not agree, you may not use NightLine COMO's services. NightLine COMO LLC provides late-night transportation, shuttle rentals, and associated digital services to riders in Columbia, Missouri.
            </Text>

            <Text style={termsStyles.sectionTitle}>2. Company Information</Text>
            <Text style={termsStyles.body}>
              NightLine COMO LLC is a registered limited liability company operating under Missouri law.{'\n'}
              Location: Columbia, Missouri{'\n'}
              Contact: support@nightlinecomo.com
            </Text>

            <Text style={termsStyles.sectionTitle}>3. Services Provided</Text>
            <Text style={termsStyles.body}>
              NightLine COMO offers late-night shuttle services, app-based subscriptions, and rental options for private events. Services include:{'\n\n'}
              • Solo Plan: Individual unlimited monthly rides{'\n'}
              • Small Greek Partner Plan (25–50 members){'\n'}
              • Large Greek Partner Plan (51+ members){'\n'}
              • Night Pass: Unlimited rides for a single night{'\n'}
              • Shuttle Rental: Private bus rental for special events
            </Text>

            <Text style={termsStyles.sectionTitle}>4. Subscription & Payment Terms</Text>
            <Text style={termsStyles.body}>
              All subscriptions and passes are billed through Stripe. Current Pricing:{'\n\n'}
              • Solo Plan – $32.99/month{'\n'}
              • Small Greek Partner Plan – $28.99/month{'\n'}
              • Large Greek Partner Plan – $25.99/month{'\n'}
              • Shuttle Rental – $500 per rental{'\n'}
              • Night Pass – $11.99 per night{'\n\n'}
              Subscriptions renew automatically each month unless canceled at least 48 hours before the next billing date. Summer subscriptions are automatically paused mid-May through July.
            </Text>

            <Text style={termsStyles.sectionTitle}>5. Account Use & Rider Conduct</Text>
            <Text style={termsStyles.body}>
              Users agree to remain respectful to staff, drivers, and other riders; be sober enough to safely board and exit the shuttle; follow all driver instructions; and refrain from bringing open containers unless explicitly approved. Misconduct may result in removal or permanent ban without refund.
            </Text>

            <Text style={termsStyles.sectionTitle}>6. Lost or Stolen Property</Text>
            <Text style={termsStyles.body}>
              NightLine COMO LLC is not responsible for lost, stolen, or damaged personal property. Items found on buses will be held for up to 7 days before being discarded or donated.
            </Text>

            <Text style={termsStyles.sectionTitle}>7. Safety & Liability Disclaimer</Text>
            <Text style={termsStyles.body}>
              Riders voluntarily assume all risks associated with transportation. NightLine COMO LLC and its drivers are not liable for any personal injury or property loss unless directly caused by gross negligence or intentional misconduct.
            </Text>

            <Text style={termsStyles.sectionTitle}>8. Age & Access Policy</Text>
            <Text style={termsStyles.body}>
              You must be at least 18 years old or have parent/guardian consent to create an account or ride independently.
            </Text>

            <Text style={termsStyles.sectionTitle}>9. Payment Disputes</Text>
            <Text style={termsStyles.body}>
              Payment disputes must first be submitted to support@nightlinecomo.com before initiating a chargeback. Failure to do so may result in suspension or loss of account privileges.
            </Text>

            <Text style={termsStyles.sectionTitle}>10. Governing Law</Text>
            <Text style={termsStyles.body}>
              These Terms are governed by the laws of the State of Missouri. Disputes shall be resolved in the courts of Boone County, Missouri.
            </Text>

            <Text style={termsStyles.sectionTitle}>11. Contact</Text>
            <Text style={termsStyles.body}>
              For questions, disputes, or lost property: support@nightlinecomo.com
            </Text>
          </ScrollView>

          <TouchableOpacity style={termsStyles.button} onPress={onAccept}>
            <Text style={termsStyles.buttonText}>I Accept the Terms & Conditions</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Layout Content ───────────────────────────────────────────────────────────

function LayoutContent() {
  const router = useRouter();
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const [isReady, setIsReady] = useState(false);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    console.log('Auth Status:', authStatus);
  }, [authStatus]);

  useEffect(() => {
    async function loadGroups() {
      try {
        // Force refresh so custom attributes are included
        const session = await fetchAuthSession({ forceRefresh: true });
        const idToken = session.tokens?.idToken;

        if (!idToken) {
          setGroups([]);
          return;
        }

        const payload = idToken.payload as any;

        // Check if terms have been accepted
        const termsAccepted = payload['custom:terms_accepted'];
        console.log('Terms accepted:', termsAccepted);

        if (!termsAccepted || termsAccepted !== 'true') {
          setShowTerms(true);
        }

        setGroups(payload['cognito:groups'] || []);
      } catch (err) {
        console.error('Error loading groups:', err);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }

    if (authStatus === 'authenticated') {
      loadGroups();
    } else {
      setLoading(false);
    }
  }, [authStatus]);

  const handleAcceptTerms = async () => {
    try {
      await updateUserAttributes({
        userAttributes: {
          'custom:terms_accepted': 'true',
          'custom:terms_accepted_date': new Date().toISOString(),
        }
      });
      console.log('Terms accepted and saved');
    } catch (err) {
      console.error('Error saving terms acceptance:', err);
    } finally {
      setShowTerms(false);
    }
  };

  const isAdmin = groups.includes('Admin');
  const isBusDriver = groups.includes('BusDrivers');

  useEffect(() => {
    setIsReady(true);
    SplashScreen.hideAsync();
  }, []);

  // Block routing until terms are accepted
  useEffect(() => {
    if (isReady && !loading && !showTerms) {
      console.log('Routing — isAdmin:', isAdmin, '| isBusDriver:', isBusDriver);
      if (isAdmin) {
        router.replace('/(adminTabs)');
      } else if (isBusDriver) {
        router.replace('/(busTabs)');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isReady, loading, isAdmin, isBusDriver, showTerms]);

  if (!isReady) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {showTerms && <TermsModal onAccept={handleAcceptTerms} />}
    </>
  );
}

// ─── Phone Formatter ─────────────────────────────────────────────────────────

export function formatPhoneToE164(phone: string): string {
  if (!phone) throw new Error('Phone number is required');
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  throw new Error('Phone number must be 10 digits (US)');
}

// ─── Root Layout ─────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const colorMode = useColorScheme();

  useEffect(() => {
    async function hideSplash() {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        console.warn('Splash screen hide error:', e);
      } finally {
        setIsReady(true);
      }
    }
    hideSplash();
  }, []);

  if (!isReady) return null;

  return (
    <ThemeProvider
      colorMode={colorMode}
      theme={{
        tokens: {
          colors: {
            primary: {
              10: colors.primary,
              20: colors.primary,
              40: colors.primary,
              60: colors.primary,
              80: colors.primary,
              90: colors.primary,
              100: colors.primary,
            },
            background: {
              primary: 'transparent',
              secondary: 'transparent',
              tertiary: 'transparent',
            },
            font: {
              primary: colors.placeholder,
              secondary: colors.placeholder,
              tertiary: colors.placeholder,
            },
          },
        },
      }}
    >
      <LinearGradient
        colors={[colors.secondary, '#222222']}
        style={styles.container}
      >
        <AppLinkHandler />
        <Authenticator.Provider>
          <Authenticator
            components={{
              SignUp: ({ fields, ...props }) => (
                <Authenticator.SignUp
                  {...props}
                  fields={[
                    { name: 'username', label: 'Username', type: 'default', placeholder: 'Choose a username', required: true },
                    { name: 'email', label: 'Email Address', type: 'email', placeholder: 'Enter your email address', required: true },
                    { name: 'given_name', label: 'First Name', type: 'default', placeholder: 'Enter your First Name', required: true },
                    { name: 'family_name', label: 'Last Name', type: 'default', placeholder: 'Enter your Last Name', required: true },
                    { name: 'phone_number', label: 'Phone Number', type: 'default', placeholder: '+1 XXXXXXXXXX', required: true },
                    { name: 'password', label: 'Password', type: 'password', placeholder: 'Enter a password', required: true },
                    { name: 'confirm_password', label: 'Confirm Password', type: 'password', placeholder: 'Confirm your password', required: true },
                  ]}
                />
              ),
            }}
            services={{
              async validateCustomSignUp(formData) {
                const errors: Record<string, string> = {};
                try {
                  if (formData.phone_number) formatPhoneToE164(formData.phone_number);
                } catch (err: any) {
                  errors.phone_number = err.message;
                }
                if (Object.keys(errors).length > 0) return errors;
              },
              async handleSignUp(formData) {
                const { signUp } = await import('aws-amplify/auth');
                const { username, password, options } = formData;
                const userAttributes = { ...options?.userAttributes };
                if (userAttributes.phone_number) {
                  userAttributes.phone_number = formatPhoneToE164(userAttributes.phone_number);
                }
                userAttributes.preferred_username = username;
                console.log('Submitting to Cognito:', { username, userAttributes });
                return signUp({ username, password, options: { userAttributes } });
              },
              async handleSignIn({ username, password }) {
                const { signIn } = await import('aws-amplify/auth');
                try {
                  const result = await signIn({
                    username,
                    password,
                    options: { authFlowType: 'USER_PASSWORD_AUTH' }
                  });
                  console.log('Sign in result:', JSON.stringify(result));
                  return result;
                } catch (err: any) {
                  console.log('Sign in ERROR name:', err.name);
                  console.log('Sign in ERROR message:', err.message);
                  console.log('Sign in ERROR full:', JSON.stringify(err));
                  throw err;
                }
              },
            }}
          >
            <LayoutContent />
          </Authenticator>
        </Authenticator.Provider>
      </LinearGradient>
    </ThemeProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
});

const termsStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxHeight: '85%',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: colors.placeholder,
    marginBottom: 16,
    textAlign: 'center',
  },
  scrollView: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 14,
    marginBottom: 4,
  },
  body: {
    fontSize: 13,
    color: '#cccccc',
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});