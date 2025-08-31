import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Redirect, Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import React, { Suspense } from "react";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/store/authStore";
import { Amplify } from 'aws-amplify';
import config from '../aws-exports';
import { View, Text, Button } from 'react-native';
import WelcomeScreen from "./index";
// import { AuthProvider, useAuth } from "react-oidc-context";
import { AuthProvider, useAuth } from "../assets/AuthContext"; // the AuthProvider we built


// export const unstable_settings = {
//   initialRouteName: "index",
// };

const cognitoAuthConfig = {
  authority: "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_w1D8ll1eh",
  client_id: "40rq35lsi8d0piforq4mqoip9v",
  redirect_uri: "http://localhost:8081",
  response_type: "code",
  scope: "phone openid email",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

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
    <AuthProvider {...cognitoAuthConfig}>
      <LayoutContent /> {/*  //wrap in suspense? */}
    </AuthProvider>
  );
}
// export default function RootLayout() {
//   const [loaded, error] = useFonts({
//     ...FontAwesome.font,
//   });

//   const { isAuthenticated, isOnboarded } = useAuthStore();

//   useEffect(() => {
//     if (error) {
//       console.error(error);
//       throw error;
//     }
//   }, [error]);

//   useEffect(() => {
//     if (loaded) {
//       SplashScreen.hideAsync();
//     }
//   }, [loaded]);

//   if (!loaded) {
//     return null;
//   }

//   return (

//     <Suspense fallback={
//       <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
//         <Text>Loading...</Text>
//       </View>
//     }>
//       <AuthProvider {...cognitoAuthConfig}>
//         <LayoutContent />
//       </AuthProvider>
//     </Suspense>
//   );

// }

// function LayoutContent() {
//   const router = useRouter();
//   const auth = useAuth();

//   useEffect(() => {
//     if (!auth.isLoading) {
//       if (auth.isAuthenticated) {
//         router.replace("/(tabs)");
//       } else {
//         router.replace("/");
//       }
//     }
//   }, [auth.isLoading, auth.isAuthenticated]);

//   return (
//     <Stack screenOptions={{ headerShown: false }}>
//       <Stack.Screen name="index" />
//       <Stack.Screen name="(tabs)" />
//     </Stack>
//   );
// }

function LayoutContent() {
 const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    // When auth state changes, redirect accordingly
    if (user) {
      router.replace("/(tabs)"); // user is logged in
    } else {
      router.replace("/"); // user not logged in
    }
  }, [user]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}