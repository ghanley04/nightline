import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/store/authStore";
import { Amplify } from 'aws-amplify';
import config from '../aws-exports'; 

Amplify.configure(config);


export const unstable_settings = {
  initialRouteName: "index",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });
  
  const { isAuthenticated, isOnboarded } = useAuthStore();

  useEffect(() => {
    if (error) {
      console.error(error);
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const { isAuthenticated, isOnboarded } = useAuthStore();

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="auth/login" options={{ title: "Log In" }} />
            <Stack.Screen name="auth/signup" options={{ title: "Sign Up" }} />
          </>
        ) : !isOnboarded ? (
          <Stack.Screen name="onboarding/index" options={{ headerShown: false, gestureEnabled: false }} />
        ) : (
          <>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="subscription/plans" options={{ presentation: 'modal', title: 'Choose a Plan' }} />
            <Stack.Screen name="subscription/payment" options={{ presentation: 'modal', title: 'Payment' }} />
            <Stack.Screen name="guest/create" options={{ presentation: 'modal', title: 'Invite a Guest' }} />
            <Stack.Screen name="rental/request" options={{ presentation: 'modal', title: 'Request Bus Rental' }} />
          </>
        )}
      </Stack>
    </>
  );
}