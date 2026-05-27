import React from 'react';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { UserPlus, User } from 'lucide-react-native';
import colors from '../../constants/colors';

export default function TabLayout() {
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
            // Matches (tabs)/_layout.tsx — compact bar with breathing room
            // between the (slightly larger) icon and label.
            height: 72,
            paddingTop: 8,
            paddingBottom: 14,
            paddingHorizontal: 12,
          },
          tabBarLabelStyle: {
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
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Add Greek',
            tabBarIcon: ({ color, size }) => (
              <UserPlus size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="data"
          options={{
            title: 'Data',
            tabBarIcon: ({ color, size }) => (
              <User size={26} color={color} />
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