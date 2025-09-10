import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Redirect, Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import React, { Suspense } from "react";
import { StatusBar } from "expo-status-bar";
// import WelcomeScreen from "./index";
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react-native';
import { Amplify } from 'aws-amplify';
import config from '../src/aws-exports';
import { Tabs } from 'expo-router';
import { MapPin, QrCode, User, Bus } from 'lucide-react-native';
import colors from '../constants/colors';

Amplify.configure(config);
SplashScreen.preventAutoHideAsync();

function LayoutContent() {
  const router = useRouter();
  // const { user } = useAuth();
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // This is where you would load fonts or other assets
    // For now, we'll just simulate a delay and hide the splash screen
    setIsReady(true);
    SplashScreen.hideAsync();
  }, []);

  // useEffect(() => {
  //   // When auth state changes, redirect accordingly
  //   if (user) {
  //     router.replace("/(tabs)"); // user is logged in
  //   } else {
  //     router.replace("/"); // user not logged in
  //   }
  // }, [user]);


  if (!isReady) {
    return null; // Keep splash screen visible
  }

  // If not authenticated, render the login stack
  return (
    // The main Stack navigator must be rendered unconditionally
    <Stack screenOptions={{ headerShown: false }}>
      {/* Conditionally render screens based on authentication status */}
      {authStatus === 'authenticated' ? (
        // <Stack.Screen name="(tabs)" redirect={true} />
        <Redirect href="/(tabs)" />
      ) : (
        // If not authenticated, render the login screen
        <Stack.Screen name="index" />
      )}
    </Stack>
  );
}

export default function RootLayout() {
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    // Keep splash screen visible until Maps + Auth are ready
    SplashScreen.preventAutoHideAsync();

    // Load Google Maps script on web
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      if (!document.getElementById("google-maps")) {
        const script = document.createElement("script");
        script.id = "google-maps";
        script.src =
          "https://maps.googleapis.com/maps/api/js?key=AIzaSyBslAp0O6Z5vBFWS2lwIqLQ6Asp3YrRT8U&libraries=places";

        // script.src = `https://maps.googleapis.com/maps/api/js?key=${
        //   process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        // }&libraries=places`;
        script.async = true;
        script.defer = true;

        script.onload = () => {
          setMapsReady(true);
          SplashScreen.hideAsync(); // ✅ hide splash once ready
        };

        script.onerror = () => {
          console.error("Failed to load Google Maps script");
          SplashScreen.hideAsync();
        };

        document.head.appendChild(script);
      }
    } else {
      // Native doesn’t need script load
      setMapsReady(true);
      SplashScreen.hideAsync();
    }
  }, []);

  if (!mapsReady) {
    return null; // keep splash visible
  }

  return (
    <Authenticator.Provider>
      <Authenticator>
        <LayoutContent />
      </Authenticator>
    </Authenticator.Provider>);
}