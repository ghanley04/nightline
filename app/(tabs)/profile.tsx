import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { User, Mail, Phone, Camera, MapPin } from 'lucide-react-native';
import Card from '@/components/Card';
import Button from '@/components/Button';
import colors from '../../constants/colors';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import {
  signOut,
  deleteUser,
  fetchUserAttributes,
  UserAttributeKey,
  updateUserAttributes,
  confirmUserAttribute,
  getCurrentUser,
} from 'aws-amplify/auth';
import type { VerifiableUserAttributeKey } from '@aws-amplify/auth';
import * as ImagePicker from 'expo-image-picker';
import { uploadData, getUrl, remove } from 'aws-amplify/storage';
import { MembershipResponse } from '../interfaces/interface';
import { get, post } from 'aws-amplify/api';
import { useFocusEffect } from '@react-navigation/native';

export async function getUserAttributes() {
  try {
    const userAttributes = await fetchUserAttributes();
    console.log('User attributes fetched successfully:', userAttributes);
    return userAttributes;
  } catch (error) {
    console.error('Error fetching user attributes:', error);
    return null;
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuthenticator(context => [context.user]);
  const { authStatus } = useAuthenticator(context => [context.authStatus]);

  const [attributes, setAttributes] = useState<Partial<Record<UserAttributeKey, string>> | null>(null);
  const [draftAttributes, setDraftAttributes] = useState<Partial<Record<UserAttributeKey, string>> | null>(null);
  const [passes, setPasses] = useState<{ groupId: string; id: string; tokenId: string }[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const [screenLoading, setScreenLoading] = useState(true);
  const [membershipRefreshing, setMembershipRefreshing] = useState(false);

  const [verificationState, setVerificationState] = useState<{
    attributeKey?: UserAttributeKey;
    showModal: boolean;
    code: string;
  }>({ showModal: false, code: '' });

  interface DeleteMembershipResponse {
    success: boolean;
    error?: string;
    canceledSubscriptions?: string[];
    timestamp?: string;
  }

  const fetchMembershipTokens = useCallback(async () => {
    if (!user?.userId) {
      setPasses([]);
      return;
    }

    try {
      console.log('🔍 [PROFILE] Checking user:', user);

      const response = await get({
        apiName: 'apiNightline',
        path: '/fetchMembership',
        options: {
          queryParams: { userId: user.userId },
        },
      });

      const { body } = await response.response;
      const rawData = await body.json();

      console.log('📦 [PROFILE] Membership raw data:', rawData);

      const data = rawData as unknown as MembershipResponse;

      if (data.hasMembership && data.tokens?.length) {
        const activeMemberships = data.tokens.filter(t => t.active === true && t.token_id);
        const formatted = activeMemberships.map((t, i) => ({
          id: `token-${i}`,
          tokenId: t.token_id,
          groupId: t.group_id,
        }));
        setPasses(formatted);
      } else {
        setPasses([]);
      }
    } catch (err) {
      console.error('❌ [PROFILE] Error fetching membership token:', err);
      setPasses([]);
    }
  }, [user?.userId]);

  const fetchProfilePhoto = useCallback(async () => {
    try {
      if (!user?.userId) {
        setImageUrl('');
        return;
      }

      const key = `profile/${user.userId}.jpg`;

      const { url } = await getUrl({
        key,
        options: {
          accessLevel: 'private',
          validateObjectExistence: true,
          expiresIn: 3600,
        },
      });

      setImageUrl(url.toString());
    } catch (err) {
      console.error('❌ [PROFILE] Fetch photo error:', err);
      setImageUrl('');
    }
  }, [user?.userId]);

  const fetchProfileData = useCallback(async (showLoader = false) => {
    if (authStatus !== 'authenticated') {
      setScreenLoading(false);
      return;
    }

    try {
      if (showLoader) setScreenLoading(true);

      const [userAttributes] = await Promise.all([
        getUserAttributes(),
        fetchMembershipTokens(),
        fetchProfilePhoto(),
      ]);

      setAttributes(userAttributes);
      setDraftAttributes(userAttributes);
    } catch (err) {
      console.error('❌ [PROFILE] Error loading profile data:', err);
    } finally {
      setScreenLoading(false);
      setMembershipRefreshing(false);
    }
  }, [authStatus, fetchMembershipTokens, fetchProfilePhoto]);

  useEffect(() => {
    fetchProfileData(true);
  }, [fetchProfileData]);

  useFocusEffect(
    useCallback(() => {
      fetchProfileData(false);
    }, [fetchProfileData])
  );

  const handleInputChange = (key: UserAttributeKey, value: string) => {
    setDraftAttributes(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This will cancel all subscriptions and deactivate all memberships. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              try {
                await remove({
                  key: `profile/${user?.userId}.jpg`,
                  options: { accessLevel: 'private' },
                });
                console.log('✅ Profile photo removed');
              } catch (s3Error) {
                console.warn('⚠️ Could not remove profile photo:', s3Error);
              }

              const response = await post({
                apiName: 'apiNightline',
                path: '/delete-account',
                options: {
                  body: {
                    userId: user?.userId,
                    reason: 'user_requested_deletion',
                  },
                },
              });

              const { body } = await response.response;
              const result = await body.json();

              console.log('📦 Delete account result:', result);

              if (result?.success === false) {
                Alert.alert('Error', result.error || 'Failed to delete account.');
                return;
              }

              await deleteUser();
              Alert.alert('Account Deleted', 'Your account has been permanently removed.');
            } catch (error) {
              console.error('❌ Error deleting account:', error);

              let errorMessage = 'Unknown error occurred';

              if (typeof error === 'object' && error !== null) {
                const err = error as any;

                if (err._response?.body) {
                  try {
                    const bodyError =
                      typeof err._response.body === 'string'
                        ? JSON.parse(err._response.body)
                        : err._response.body;

                    errorMessage = bodyError.error || bodyError.message || errorMessage;
                  } catch {
                    errorMessage = err._response.body;
                  }
                } else if (err.message) {
                  errorMessage = err.message;
                }
              }

              Alert.alert('Error', `Failed to delete account: ${errorMessage}`);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!draftAttributes) return;

    const attributesToUpdate: Record<string, string> = {};

    (Object.keys(draftAttributes) as UserAttributeKey[]).forEach(key => {
      if (draftAttributes[key] !== attributes?.[key] && draftAttributes[key]) {
        attributesToUpdate[key] = draftAttributes[key]!;
      }
    });

    if (Object.keys(attributesToUpdate).length === 0) {
      Alert.alert('No Changes', 'No profile changes were detected.');
      setIsEditing(false);
      return;
    }

    try {
      const output = await updateUserAttributes({
        userAttributes: attributesToUpdate,
      });

      console.log('Update result:', output);

      let verificationRequired = false;
      let pendingAttribute: UserAttributeKey | null = null;

      for (const key of Object.keys(output) as UserAttributeKey[]) {
        const attrResult = output[key];
        if (attrResult?.nextStep?.updateAttributeStep === 'CONFIRM_ATTRIBUTE_WITH_CODE') {
          verificationRequired = true;
          pendingAttribute = key;
          break;
        }
      }

      if (verificationRequired && pendingAttribute) {
        setVerificationState({
          attributeKey: pendingAttribute,
          showModal: true,
          code: '',
        });

        setDraftAttributes(attributes || {});
        setIsEditing(false);
        return;
      }

      Alert.alert('Success', 'Your profile has been updated.');
      await fetchProfileData(false);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Update Failed', 'There was an error updating your profile.');
      setDraftAttributes(attributes || {});
      setIsEditing(false);
    }
  };

  const handleConfirmUpdate = async (attributeKey: UserAttributeKey, code: string) => {
    if (attributeKey !== 'email' && attributeKey !== 'phone_number') {
      Alert.alert('Invalid Verification', 'Only email or phone number can be verified.');
      return;
    }

    try {
      await confirmUserAttribute({
        userAttributeKey: attributeKey as VerifiableUserAttributeKey,
        confirmationCode: code,
      });

      Alert.alert('Confirmed', 'Your new contact information is now verified and saved.');
      await fetchProfileData(false);
    } catch (error) {
      console.error('Error confirming attribute:', error);
      Alert.alert(
        'Verification Failed',
        'The code was incorrect or expired. Please try updating your information again or request a new code.'
      );
      setDraftAttributes(attributes || {});
    }
  };

  async function pickAndUploadProfilePhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (result.canceled) return;

      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();

      const currentUser = await getCurrentUser();
      const key = `profile/${currentUser.userId}.jpg`;

      const upload = await uploadData({
        key,
        data: blob,
        options: {
          accessLevel: 'private',
          contentType: 'image/jpeg',
        },
      });

      await upload.result;
      console.log('✅ Uploaded profile photo:', key);
      await fetchProfilePhoto();
    } catch (err) {
      console.error('❌ Upload error:', err);
    }
  }

  const handleCancel = () => {
    setDraftAttributes(attributes || {});
    setIsEditing(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          onPress: () => signOut(),
          style: 'destructive',
        },
      ]
    );
  };

  const deleteMembership = async (groupId: string) => {
    if (!groupId || !user?.userId) return;

    Alert.alert(
      'Delete Subscription',
      'Are you sure you want to delete this subscription? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔍 Attempting to delete membership:', {
                userId: user.userId,
                groupId,
              });

              const response = await post({
                apiName: 'apiNightline',
                path: '/delete-membership',
                options: {
                  body: {
                    userId: user.userId,
                    groupId,
                  },
                },
              });

              const { body } = await response.response;
              const rawResult = await body.json();
              console.log('📦 Parsed result:', rawResult);

              const result = rawResult as unknown as DeleteMembershipResponse;

              if (result.success === false) {
                Alert.alert('Error', result.error || 'Failed to delete subscription. Please try again.');
                return;
              }

              setMembershipRefreshing(true);
              await fetchMembershipTokens();
              setMembershipRefreshing(false);

              Alert.alert('Success', 'Your subscription has been deleted successfully.');
            } catch (error) {
              console.error('❌ Error deleting membership:', error);

              let errorMessage = 'Unknown error occurred';

              if (typeof error === 'object' && error !== null) {
                const err = error as any;

                if (err._response?.body) {
                  try {
                    const bodyError =
                      typeof err._response.body === 'string'
                        ? JSON.parse(err._response.body)
                        : err._response.body;

                    errorMessage = bodyError.error || bodyError.message || errorMessage;
                  } catch {
                    errorMessage = err._response.body;
                  }
                } else if (err.message) {
                  errorMessage = err.message;
                }
              } else if (error instanceof Error) {
                errorMessage = error.message;
              }

              Alert.alert('Error', `Failed to delete subscription: ${errorMessage}`);
            } finally {
              setMembershipRefreshing(false);
            }
          },
        },
      ]
    );
  };

  const getPassType = (groupId: string) => {
    if (!groupId) return 'Unknown';

    const prefix = groupId.slice(0, 3).toLowerCase();

    switch (prefix) {
      case 'ind':
        return 'Individual Pass';
      case 'nig':
        return 'Night Pass';
      case 'gre':
        return 'Greek Pass';
      case 'gro':
        return 'Group Pass';
      default:
        return 'Unknown Pass';
    }
  };

  const renderInfoField = (
    label: string,
    key: UserAttributeKey,
    value: string,
    icon: JSX.Element
  ) => (
    <View>
      <View style={styles.infoItem}>
        <View style={styles.infoIcon}>{icon}</View>
        <View style={styles.infoContent}>
          <Text style={styles.infoLabel}>{label}</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={draftAttributes?.[key] ?? ''}
              onChangeText={(text) => handleInputChange(key, text)}
              placeholder={value}
              placeholderTextColor={colors.textLight}
            />
          ) : (
            <Text style={styles.infoValue}>{value}</Text>
          )}
        </View>
      </View>
      <View style={styles.divider} />
    </View>
  );

  if (screenLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={styles.photoContainer}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{ width: 120, height: 120, borderRadius: 60 }}
              />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>
                  {user?.username?.charAt(0) || 'U'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.cameraButton}
              onPress={pickAndUploadProfilePhoto}
            >
              <Camera size={16} color={colors.background} />
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{user?.username}</Text>
          <Text style={styles.userType}>
            {user?.userId === 'individual'
              ? 'Individual Student'
              : user?.userId === 'greek'
                ? 'Greek Life Member'
                : 'Guest'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <Card style={styles.infoCard}>
            {renderInfoField(
              'First Name',
              'given_name',
              draftAttributes?.given_name || '',
              <User size={18} color={colors.primary} />
            )}
            {renderInfoField(
              'Last Name',
              'family_name',
              draftAttributes?.family_name || '',
              <User size={18} color={colors.primary} />
            )}
            {renderInfoField(
              'Email',
              'email',
              draftAttributes?.email || '',
              <Mail size={18} color={colors.primary} />
            )}
            {renderInfoField(
              'Phone',
              'phone_number',
              draftAttributes?.phone_number || '',
              <Phone size={18} color={colors.primary} />
            )}
          </Card>

          <Modal
            visible={verificationState.showModal}
            transparent
            animationType="fade"
            onRequestClose={() => setVerificationState({ showModal: false, code: '' })}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalView}>
                <Text style={styles.modalTitle}>Enter Verification Code</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Verification Code"
                  placeholderTextColor={colors.textLight}
                  value={verificationState.code}
                  onChangeText={(text) => setVerificationState(prev => ({ ...prev, code: text }))}
                  keyboardType="numeric"
                />
                <View style={styles.modalButtonContainer}>
                  <TouchableOpacity onPress={() => setVerificationState({ showModal: false, code: '' })}>
                    <Text style={styles.modalButtonCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (verificationState.attributeKey && verificationState.code) {
                        handleConfirmUpdate(verificationState.attributeKey, verificationState.code);
                        setVerificationState({ showModal: false, code: '' });
                      } else {
                        Alert.alert('Error', 'Please enter a valid code.');
                      }
                    }}
                  >
                    <Text style={styles.modalButtonConfirmText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {isEditing ? (
            <View>
              <TouchableOpacity style={styles.editButton} onPress={handleCancel}>
                <Text style={styles.editButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editButton} onPress={handleSave}>
                <Text style={styles.editButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
              <Text style={styles.modalButtonConfirmText}>Edit Information</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.subscriptionHeader}>
            <Text style={styles.sectionTitle}>Subscriptions</Text>
            {membershipRefreshing && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>

          <Card style={styles.settingsCard}>
            {passes.length === 0 ? (
              <View style={styles.settingItem}>
                <Text style={[styles.settingText, { color: 'gray', textAlign: 'center' }]}>
                  You have no subscriptions. Go to the Plans section to get started.
                </Text>
              </View>
            ) : (
              passes.map((p, i) => {
                const isLastPass = i === passes.length - 1;

                return (
                  <View key={p.tokenId || i}>
                    <View style={styles.settingItem}>
                      <View style={styles.settingInfo}>
                        <View style={styles.settingTitle}>
                          <MapPin size={18} color={colors.primary} />
                          <Text style={styles.settingText}>{getPassType(p.groupId)}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => deleteMembership(p.groupId)}
                      >
                        <Text style={styles.modalButtonConfirmText}>Delete Subscription</Text>
                      </TouchableOpacity>
                    </View>
                    {!isLastPass && <View style={styles.divider} />}
                  </View>
                );
              })
            )}
          </Card>
        </View>

        <Button
          title="Log Out"
          onPress={handleLogout}
          variant="secondary"
          style={styles.logoutButton}
        />

        <Button
          title="Delete Account"
          onPress={handleDeleteAccount}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: 12,
  },
  loadingText: {
    color: colors.textLight,
    fontSize: 15,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  photoContainer: {
    position: 'relative',
    marginBottom: 16,
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
  section: {
    marginBottom: 24,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
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
  input: {
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.background,
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
    flexDirection: 'column',
    alignItems: 'center',
  },
  settingTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    marginLeft: 12,
    fontSize: 16,
    color: colors.text,
  },
  logoutButton: {
    marginTop: 16,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: colors.text,
  },
  modalInput: {
    height: 40,
    width: '100%',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 20,
    color: colors.text,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 10,
  },
  modalButtonCancelText: {
    color: colors.textLight,
    fontWeight: '600',
    padding: 10,
  },
  modalButtonConfirmText: {
    color: colors.primary,
    fontWeight: '600',
    padding: 10,
  },
});