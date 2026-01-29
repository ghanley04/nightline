import { Redirect, Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from 'expo-font';
import React, { useEffect, useState } from "react";
import { Authenticator, useAuthenticator, ThemeProvider, defaultDarkModeOverride, Theme } from '@aws-amplify/ui-react-native';
import { useColorScheme, StyleSheet, View, ViewProps, TextInput } from 'react-native';
import colors from '../constants/colors';
import { LinearGradient } from "expo-linear-gradient";
import 'react-native-url-polyfill/auto';

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

  useEffect(() => {
    setIsReady(true);
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    // Redirect after component mounts
    if (isReady) {
      router.replace('/(tabs)');
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
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
                      type: 'phone',
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

                //copies username to preferred_username if not set
                if (formData.username && !formData.preferred_username) {
                  formData.preferred_username = formData.username;
                }
                // Only validate phone if user has started typing in it
                if (formData.phone_number && formData.phone_number.length > 0) {
                  const cleaned = formData.phone_number.trim().replace(/\D/g, '');

                  if (cleaned.length === 10) {
                    // Valid - add country code
                    formData.phone_number = `+1${cleaned}`;
                  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
                    // Valid - already has country code
                    formData.phone_number = `+${cleaned}`;
                  } else {
                    // Only show error if they've typed enough digits to be wrong
                    // (i.e., don't show error after typing just 1 digit)
                    if (cleaned.length >= 10) {
                      errors.phone_number = `Phone number must be exactly 10 digits`;
                    }
                    // Don't show error if they're still typing (< 10 digits)
                  }
                }

                // Only validate password match if BOTH fields have values
                if (formData.password && formData.confirm_password) {
                  if (formData.password !== formData.confirm_password) {
                    errors.confirm_password = 'Passwords do not match';
                  }
                }

                if (Object.keys(errors).length > 0) {
                  return errors;
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