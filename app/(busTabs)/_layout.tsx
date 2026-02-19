import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MapPin, User, Bus, Camera } from 'lucide-react-native';
import { fetchAuthSession } from 'aws-amplify/auth';
import colors from '../../constants/colors';

export default function TabLayout() {
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);


  

  const isAdmin = groups.includes('Admin');
  const isBusDriver = groups.includes('BusDrivers');

  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#888888',
          tabBarInactiveTintColor: '#888888',
          tabBarStyle: {
            backgroundColor: '#111111',
            borderTopColor: '#2a2a2a',
            borderTopWidth: 1,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
          headerStyle: { backgroundColor: '#111111' },
          headerTitleStyle: { fontWeight: 'bold', color: '#ffffff' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Scan Tickets',
                headerStyle: { backgroundColor: '#111111' },
            tabBarIcon: ({ color, size }) => (
              <Camera size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
                headerStyle: { backgroundColor: '#111111' },

            tabBarIcon: ({ color, size }) => (
              <User size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}