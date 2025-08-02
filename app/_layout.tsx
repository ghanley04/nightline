import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/store/authStore";
import { Amplify } from 'aws-amplify';
import config from '../aws-exports';

import { AuthProvider, useAuth } from "react-oidc-context";



export const unstable_settings = {
  initialRouteName: "index",
};

const cognitoAuthConfig = {
  authority: "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_vx091gCAk",
  client_id: "580i17142vjq6ut5hi9mj89i6n",
  redirect_uri: "http://localhost:8081",
  response_type: "code",
  scope: "email openid phone",
};


const signOutRedirect = () => {
  const clientId = "580i17142vjq6ut5hi9mj89i6n";
  const logoutUri = "<logout uri>";
  const cognitoDomain = "https://us-east-2vx091gcak.auth.us-east-2.amazoncognito.com";
  window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
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

  return (
    <AuthProvider {...cognitoAuthConfig}>
      <LayoutContent />
    </AuthProvider>);
}

function LayoutContent() {
  const auth = useAuth(); // Call useAuth() here
  const { isAuthenticated, isOnboarded } = useAuthStore(); // Call useAuthStore() here

  // Handle auth states for the entire app (Loading, Error, Authenticated Redirects)
  if (auth.isLoading) {
    return <div>Loading authentication...</div>;
  }

  if (auth.error) {
    // You might want a more user-friendly error page here
    return <div>Authentication Error: {auth.error.message}</div>;
  }

  // --- OIDC Authentication Check and Main Navigation ---
  // The logic for displaying content based on auth state and onboarding
  // is now correctly encapsulated here.
  const finalIsAuthenticated = auth.isAuthenticated; // Directly use auth.isAuthenticated

  const cognitoDomain = cognitoAuthConfig.authority;

  return (
    <>
      <StatusBar style="dark" />

      {/* Auth/Logout Buttons for testing - consider moving these into a proper header/nav component
      <div style={{ padding: 10, display: 'flex', gap: 10, justifyContent: 'center', background: '#eee' }}>
        {!finalIsAuthenticated ? (
          <button onClick={() => auth.signinRedirect()}>Sign in</button>
        ) : (
          <>
            <button onClick={handleSignOut}>Sign out</button>
            {auth.user?.profile.email && (
              <span>Logged in as: {auth.user.profile.preferred_username}</span>
            )}
          </>
        )}
      </div> */}

      <Stack screenOptions={{ headerShown: false }}>
        {!finalIsAuthenticated ? (
          <>
            <button onClick={() => auth.signinRedirect()}>Sign in</button>
          </>
        ) : (
          <>
            <button onClick={() => signOutRedirect()}>Sign out</button>
            {auth.user?.profile.email && (
              <span>Logged in as: {auth.user.profile.preferred_username}</span>
            )}
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