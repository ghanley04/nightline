import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Redirect, Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import React, { Suspense } from "react";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/store/authStore";
import { Amplify } from 'aws-amplify';
import config from '../aws-exports';
import { View, Text } from 'react-native';
import WelcomeScreen from "./index";
import { AuthProvider, useAuth } from "react-oidc-context";

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

  useEffect(() => {
    SplashScreen.preventAutoHideAsync();
  }, []);

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

function LayoutContent() {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading) {
      if (auth.isAuthenticated) {
        router.replace("/(tabs)");
      } else {
        router.replace("/");
      }
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}