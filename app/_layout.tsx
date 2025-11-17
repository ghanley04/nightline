import { Redirect, Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { Authenticator, useAuthenticator, ThemeProvider, defaultDarkModeOverride, Theme } from '@aws-amplify/ui-react-native';
import { useColorScheme, StyleSheet, View, ViewProps } from 'react-native';
import { PropsWithChildren, FunctionComponent } from 'react';
import { I18n } from '@aws-amplify/core';
import { Amplify } from 'aws-amplify';
import config from '../src/aws-exports';
import colors from '../constants/colors';
import { LinearGradient } from "expo-linear-gradient";
import amplifyconfig from '../src/amplifyconfiguration.json';


Amplify.configure(amplifyconfig);
// Amplify.configure(config, {
//   API: {
//     REST: {
//       headers: async () => {
//         return {};
//       }
//     }
//   }
// });
//Amplify.configure(config);
SplashScreen.preventAutoHideAsync();


function LayoutContent() {
  const router = useRouter();
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // This is where you would load fonts or other assets
    // For now, we'll just simulate a delay and hide the splash screen
    setIsReady(true);
    SplashScreen.hideAsync();
  }, []);

  if (!isReady) {
    return null; // Keep splash screen visible
  }
  // If not authenticated, render the login stack
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Redirect href="/(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const colorMode = useColorScheme();

  // 1. SIMPLE useEffect to handle setup and hide the splash screen
  useEffect(() => {
    async function hideSplash() {
      try {
        await SplashScreen.hideAsync(); // This is the crucial line
      } catch (e) {
        console.warn("Splash screen hide error:", e);
      } finally {
        setIsReady(true);
      }
    }
    // Call the function to execute the hide logic
    hideSplash();
  }, []); // Run only once on component mount

  if (!isReady) {
    return null; // Don't render content until app is ready
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
              80: colors.primary, //this one is default
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

        components: {
          button: {
            // Set the main background color
            // backgroundColor: {
            //   value: '#007BFF', // 👈 Change this to your desired color (e.g., a brand blue)
            // },
            // // Optional: Change the color when the button is pressed/active
            // _active: {
            //   backgroundColor: {
            //     value: '#0056b3', // 👈 A slightly darker color for feedback
            //   },
            // },
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
                      placeholder: 'Enter your username',
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
                      //fix the number input later
                      name: 'phone_number',
                      label: 'Phone Number',
                      type: 'phone',
                      placeholder: '+1 (XXX)-XXX-XXXX',
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
          >
            {/* Container={(...props) => ( */}
            {/* // reuse default `Container` and apply custom background */}
            {/* // <Authenticator.Container */}
            {/* //   {...props} */}
            {/* //   style={{ backgroundColor: 'transparent' }} */}

            {/* // /> */}
            <LayoutContent />
          </Authenticator>
        </Authenticator.Provider>
      </LinearGradient>
    </ThemeProvider >
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