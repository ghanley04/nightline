import 'react-native-url-polyfill/auto';
import { fetch as amplifyFetch } from '@aws-amplify/react-native';

import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Authenticator, useAuthenticator, ThemeProvider } from '@aws-amplify/ui-react-native';
import { useColorScheme, StyleSheet } from 'react-native';
import colors from '../constants/colors';
import { LinearGradient } from "expo-linear-gradient";
import 'react-native-url-polyfill/auto';
import { fetchAuthSession } from 'aws-amplify/auth';
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

const redirectUrl = Linking.createURL('/');
console.log('Redirect URL:', redirectUrl);
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

// Log AFTER configure to verify
console.log('Final redirect:', redirectUrl);
const currentConfig = Amplify.getConfig();
console.log('Final Amplify OAuth:', JSON.stringify(currentConfig));

// Listen for auth events to catch real errors
Hub.listen('auth', ({ payload }) => {
  console.log('Auth event:', payload.event);
  if (payload.event) {
    console.log('Auth data:', JSON.stringify(payload.event));
  }
});

SplashScreen.preventAutoHideAsync();

// ─── Layout Content (inside Authenticator) ───────────────────────────────────

function LayoutContent() {
  const router = useRouter();
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const [isReady, setIsReady] = useState(false);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('Auth Status:', authStatus);
  }, [authStatus]);

  useEffect(() => {
    async function loadGroups() {
      try {
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken;
        if (!idToken) {
          setGroups([]);
          return;
        }
        const payload = idToken.payload as any;
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

  const isAdmin = groups.includes('Admin');
  const isBusDriver = groups.includes('BusDrivers');

  // Hide splash and mark ready
  useEffect(() => {
    setIsReady(true);
    SplashScreen.hideAsync();
  }, []);

  // Route based on group once everything is loaded
  useEffect(() => {
    if (isReady && !loading) {
      console.log('Routing — isAdmin:', isAdmin, '| isBusDriver:', isBusDriver);
      if (isAdmin) {
        router.replace('/(adminTabs)');
      } else if (isBusDriver) {
        router.replace('/(busTabs)');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isReady, loading, isAdmin, isBusDriver]);

  if (!isReady) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
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
                    {
                      name: 'username',
                      label: 'Username',
                      type: 'default',
                      placeholder: 'Choose a username',
                      required: true,
                    },
                    {
                      name: 'email',
                      label: 'Email Address',
                      type: 'email',
                      placeholder: 'Enter your email address',
                      required: true,
                    },
                    {
                      name: 'given_name',
                      label: 'First Name',
                      type: 'default',
                      placeholder: 'Enter your First Name',
                      required: true,
                    },
                    {
                      name: 'family_name',
                      label: 'Last Name',
                      type: 'default',
                      placeholder: 'Enter your Last Name',
                      required: true,
                    },
                    {
                      name: 'phone_number',
                      label: 'Phone Number',
                      type: 'default',
                      placeholder: '+1 XXXXXXXXXX',
                      required: true,
                    },
                    {
                      name: 'password',
                      label: 'Password',
                      type: 'password',
                      placeholder: 'Enter a password',
                      required: true,
                    },
                    {
                      name: 'confirm_password',
                      label: 'Confirm Password',
                      type: 'password',
                      placeholder: 'Confirm your password',
                      required: true,
                    },
                  ]}
                />
              ),
            }}
            services={{
              async validateCustomSignUp(formData) {
                const errors: Record<string, string> = {};
                try {
                  if (formData.phone_number) {
                    formatPhoneToE164(formData.phone_number);
                  }
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

                return signUp({
                  username,
                  password,
                  options: { userAttributes },
                });
              },
              async handleSignIn({ username, password }) {
                const { signIn } = await import('aws-amplify/auth');
                try {
                  const result = await signIn({
                    username,
                    password,
                    options: {
                      authFlowType: 'USER_PASSWORD_AUTH'
                    }
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
});
