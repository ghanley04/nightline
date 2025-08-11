import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { User, Mail, Phone, School, Bell, CreditCard, LogOut, Camera, MapPin } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import Card from '@/components/Card';
import Button from '@/components/Button';
import colors from '@/constants/colors';
import { useAuth } from "react-oidc-context";


export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser, logout } = useAuthStore();
  const auth = useAuth();


  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);

  const handleUpdatePhoto = async () => {
    // Check if photo was updated in the last 3 months
    const lastUpdate = new Date(user?.updatedAt || '');
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    if (lastUpdate > threeMonthsAgo) {
      Alert.alert(
        'Photo Update Restricted',
        'You can only update your photo once every 3 months for security reasons.',
        [{ text: 'OK' }]
      );
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to update your profile picture.');
      return;
    }



    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && user) {
      // Update user photo
      setUser({
        ...user,
        photoUrl: result.assets[0].uri,
        updatedAt: new Date().toISOString(),
      });

      Alert.alert('Photo Updated', 'Your profile photo has been updated successfully.');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          onPress: () => {
            logout();
            router.replace('/');
          },
          style: 'destructive'
        }
      ]
    );
  };

  const signOutRedirect = () => {
    const clientId = "40rq35lsi8d0piforq4mqoip9v";
    const logoutUri = "<logout uri>";
    const cognitoDomain = "https://<user pool domain>";
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={styles.photoContainer}>
            {user?.photoUrl ? (
              <Image source={{ uri: user.photoUrl }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>
                  {user?.name?.charAt(0) || 'U'}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.cameraButton}
              onPress={handleUpdatePhoto}
            >
              <Camera size={16} color={colors.background} />
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.userType}>
            {user?.userType === 'individual' ? 'Individual Student' :
              user?.userType === 'greek' ? 'Greek Life Member' : 'Guest'}
          </Text>

          {user?.subscriptionActive ? (
            <View style={styles.subscriptionBadge}>
              <Text style={styles.subscriptionText}>Active Subscription</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={() => router.push('/subscription/plans')}
            >
              <Text style={styles.subscribeText}>Get Subscription</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <Card style={styles.infoCard}>
            <View style={styles.infoItem}>
              <View style={styles.infoIcon}>
                <User size={18} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Full Name</Text>
                <Text style={styles.infoValue}>{user?.name}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoItem}>
              <View style={styles.infoIcon}>
                <Mail size={18} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user?.email}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoItem}>
              <View style={styles.infoIcon}>
                <Phone size={18} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{user?.phone}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoItem}>
              <View style={styles.infoIcon}>
                <School size={18} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>School</Text>
                <Text style={styles.infoValue}>{user?.schoolAffiliation}</Text>
              </View>
            </View>
          </Card>

          <TouchableOpacity style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit Information</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>

          <Card style={styles.settingsCard}>
            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Bell size={18} color={colors.primary} />
                <Text style={styles.settingText}>Push Notifications</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: colors.border, true: colors.primary + '80' }}
                thumbColor={notificationsEnabled ? colors.primary : '#f4f3f4'}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <MapPin size={18} color={colors.primary} />
                <Text style={styles.settingText}>Location Services</Text>
              </View>
              <Switch
                value={locationEnabled}
                onValueChange={setLocationEnabled}
                trackColor={{ false: colors.border, true: colors.primary + '80' }}
                thumbColor={locationEnabled ? colors.primary : '#f4f3f4'}
              />
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Methods</Text>

          <Card style={styles.paymentCard}>
            <View style={styles.paymentMethod}>
              <CreditCard size={24} color={colors.primary} />
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentTitle}>Visa ending in 4242</Text>
                <Text style={styles.paymentExpiry}>Expires 12/26</Text>
              </View>
              <TouchableOpacity style={styles.paymentAction}>
                <Text style={styles.paymentActionText}>Change</Text>
              </TouchableOpacity>
            </View>
          </Card>

          <TouchableOpacity style={styles.addPaymentButton}>
            <Text style={styles.addPaymentText}>+ Add Payment Method</Text>
          </TouchableOpacity>
        </View>

        <Button
          title="Log Out"
          onPress={() => signOutRedirect()}
          variant="secondary"
          style={styles.logoutButton}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  photoContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.primary,
  },
  photoPlaceholderText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.text,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  userType: {
    fontSize: 16,
    color: colors.textLight,
    marginBottom: 12,
  },
  subscriptionBadge: {
    backgroundColor: colors.success + '20', // 20% opacity
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  subscriptionText: {
    color: colors.success,
    fontWeight: '600',
    fontSize: 14,
  },
  subscribeButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  subscribeText: {
    color: colors.secondary,
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  infoCard: {
    padding: 0,
  },
  infoItem: {
    flexDirection: 'row',
    padding: 16,
  },
  infoIcon: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textLight,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  editButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
    padding: 8,
  },
  editButtonText: {
    color: colors.primary,
    fontWeight: '500',
  },
  settingsCard: {
    padding: 0,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    marginLeft: 12,
    fontSize: 16,
    color: colors.text,
  },
  paymentCard: {
    padding: 16,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  paymentTitle: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  paymentExpiry: {
    fontSize: 12,
    color: colors.textLight,
  },
  paymentAction: {
    padding: 8,
  },
  paymentActionText: {
    color: colors.primary,
    fontWeight: '500',
  },
  addPaymentButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    padding: 8,
  },
  addPaymentText: {
    color: colors.primary,
    fontWeight: '500',
  },
  logoutButton: {
    marginTop: 16,
  },
});