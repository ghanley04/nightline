import { Redirect, Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from 'expo-font';
import React, { useEffect, useState } from "react";
import { Authenticator, useAuthenticator, ThemeProvider, defaultDarkModeOverride, Theme } from '@aws-amplify/ui-react-native';
import { useColorScheme, StyleSheet, View, ViewProps, TextInput } from 'react-native';
import colors from '../constants/colors';
import { LinearGradient } from "expo-linear-gradient";
import 'react-native-url-polyfill/auto';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import AppLinkHandler from '@/components/AppLinkHandler';


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

import { Amplify } from 'aws-amplify';
import config from '../src/aws-exports';
// import amplifyconfig from '../src/amplifyconfiguration.json';
// Amplify.configure(amplifyconfig);

Amplify.configure(config);

// console.log("Amplify configuration loaded:", amplifyconfig);
SplashScreen.preventAutoHideAsync();

function LayoutContent() {
  const router = useRouter();
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const [isReady, setIsReady] = useState(false);
  const [role, setRole] = useState<'admin' | 'driver' | 'user' | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGroups() {
      try {
        const session = await fetchAuthSession({ bypassCache: true });
        const idToken = session.tokens?.idToken;
        if (!idToken) throw new Error('No ID token');

        const payload = idToken.payload as any;
        const userGroups = payload['cognito:groups'] || [];
        console.log("Groups from token:", userGroups);


        setGroups(userGroups);
      } catch (err) {
        console.error('Error loading groups:', err);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }

    loadGroups();
  }, []);

  const isAdmin = groups.includes('Admin');
  const isBusDriver = groups.includes('BusDrivers');

  useEffect(() => {
    if (!loading) {
      console.log("isAdmin:", isAdmin);
      console.log("isBusDriver:", isBusDriver);
    }
  }, [loading, isAdmin, isBusDriver]);

  useEffect(() => {
    setIsReady(true);
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    // 🔥 Wait for both ready AND groups loaded before routing
    if (isReady && !loading) {
      if (isAdmin) {
        router.replace('/(adminTabs)');
      } else if (isBusDriver) {
        router.replace('/(busTabs)');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isReady, loading, isAdmin, isBusDriver]);

  if (!isReady) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}

export function formatPhoneToE164(phone: string): string {
  if (!phone) {
    throw new Error("Phone number is required");
  }

  // Remove everything except digits
  const digits = phone.replace(/\D/g, "");

  // 10-digit US number
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // 11-digit starting with 1
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  throw new Error("Phone number must be 10 digits (US)");
}


export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const colorMode = useColorScheme();


  useEffect(() => {
    async function hideSplash() {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        console.warn("Splash screen hide error:", e);
      } finally {
        setIsReady(true);
      }
    }
    hideSplash();
  }, []);

  if (!isReady) {
    return null;
  }

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
            // Custom validation before submitting to Cognito
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

                // Format phone
                if (userAttributes.phone_number) {
                  userAttributes.phone_number = formatPhoneToE164(userAttributes.phone_number);
                }

                // Map username to preferred_username to satisfy Cognito schema
                userAttributes.preferred_username = username;

                console.log("Submitting to Cognito:", { username, userAttributes });

                return signUp({
                  username,
                  password,
                  options: { userAttributes },
                });
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
});