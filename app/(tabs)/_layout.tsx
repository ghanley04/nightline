import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MapPin, QrCode, User, Bus } from 'lucide-react-native';
import { fetchAuthSession } from 'aws-amplify/auth';
import colors from '../../constants/colors';

export default function TabLayout() {
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGroups() {
      try {
        const session = await fetchAuthSession({ bypassCache: true });
        const idToken = session.tokens?.idToken;
        if (!idToken) throw new Error('No ID token');
        const payload = idToken.payload as any;
        setGroups(payload['cognito:groups'] || []);
      } catch (err) {
        console.error('Error loading groups:', err);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }
    loadGroups();
  }, []);

  if (loading) return null;

  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.surfaceBorder,
            borderTopWidth: 1,
            // Compact bar with just enough vertical room for a slightly
            // larger icon + a slightly larger label and a comfortable gap
            // between them. paddingBottom is small but still clears the home
            // indicator on edge-to-edge devices.
            height: 72,
            paddingTop: 8,
            paddingBottom: 14,
            paddingHorizontal: 12,
          },
          tabBarLabelStyle: {
            // Bumped one point each; the marginTop is the real readability
            // win — it stops the label from kissing the icon.
            fontSize: 12,
            fontWeight: '600',
            letterSpacing: 0.3,
            marginTop: 6,
          },
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: {
            fontWeight: '700',
            color: colors.text,
            fontSize: 18,
          },
          headerShadowVisible: false,
          headerTintColor: colors.text,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Map',
            tabBarIcon: ({ color, size }) => (
              <MapPin size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="pass"
          options={{
            title: 'My Pass',
            tabBarIcon: ({ color, size }) => (
              <QrCode size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="plans"
          options={{
            title: 'Plans',
            tabBarIcon: ({ color, size }) => (
              <Bus size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <User size={26} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}