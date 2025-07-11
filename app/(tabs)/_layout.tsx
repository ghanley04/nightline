import React from 'react';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MapPin, QrCode, User, Bus } from 'lucide-react-native';
import colors from '../../constants/colors';

export default function TabLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textLight,
          tabBarStyle: {
            borderTopColor: colors.border,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '500',
          },
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            fontWeight: 'bold',
            color: colors.text,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Map',
            tabBarIcon: ({ color, size }) => (
              <MapPin size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="pass"
          options={{
            title: 'My Pass',
            tabBarIcon: ({ color, size }) => (
              <QrCode size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="rentals"
          options={{
            title: 'Rentals',
            tabBarIcon: ({ color, size }) => (
              <Bus size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <User size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}