import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MapPin, QrCode, User, Bus, CreditCard, Ticket } from 'lucide-react-native';
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
        const userGroups = payload['cognito:groups'] || [];
        console.log("Groups from token:", groups);
        console.log("isAdmin:", isAdmin);
        console.log("isBusDriver:", isBusDriver);


        setGroups(userGroups);
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

  const isAdmin = groups.includes('Admin');
  const isBusDriver = groups.includes('BusDrivers');

  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textLight,
          tabBarStyle: { borderTopColor: colors.border },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { fontWeight: 'bold', color: colors.text },
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
              name="plans"
              options={{
                title: 'Plans',
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
