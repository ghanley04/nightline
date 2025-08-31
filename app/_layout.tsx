import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Redirect, Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import React, { Suspense } from "react";
import { StatusBar } from "expo-status-bar";
import WelcomeScreen from "./index";
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react-native';
import { Amplify } from 'aws-amplify';
import config from '../src/aws-exports';

Amplify.configure(config);

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
    <Authenticator.Provider>
      <Authenticator>
        <LayoutContent />
      </Authenticator>
    </Authenticator.Provider>);
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
  // const { user } = useAuth();
const { authStatus } = useAuthenticator(context => [context.authStatus]);


  // useEffect(() => {
  //   // When auth state changes, redirect accordingly
  //   if (user) {
  //     router.replace("/(tabs)"); // user is logged in
  //   } else {
  //     router.replace("/"); // user not logged in
  //   }
  // }, [user]);

  if (authStatus === 'authenticated') {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

