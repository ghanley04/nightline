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


interface DeleteAccountResponse {
  success?: boolean;
  error?: string;
  message?: string;
  details?: {
    membershipsDeactivated?: number;
    groupsAffected?: number;
  };
  timestamp?: string;
}

// Transfer-ownership UI is currently disabled for the initial release.
// Backend lambda still exists (transferGroupOwnsership); this interface is
// preserved so the UI can be re-enabled later without re-deriving the shape.
interface TransferOwnershipResponse {
  success: boolean;
  error?: string;
  message?: string;
  newOwnerUsername?: string;
}

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
  const [passes, setPasses] = useState<{
    isOwner: boolean; groupId: string; id: string; tokenId: string
  }[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const [screenLoading, setScreenLoading] = useState(true);
  const [membershipRefreshing, setMembershipRefreshing] = useState(false);

  const [verificationState, setVerificationState] = useState<{
    attributeKey?: UserAttributeKey;
    showModal: boolean;
    code: string;
  }>({ showModal: false, code: '' });

  // ─── Type for the unified delete-membership lambda response ────────────────
  // The lambda returns the same envelope for all three modes:
  //   mode === 'leave'         → non-owner Greek member walked out
  //   mode === 'owner_delete'  → Greek owner scheduled cancel-at-period-end
  //   mode === 'cancel' (or absent) → non-Greek immediate cancel
  interface DeleteMembershipFlowResponse {
    success: boolean;
    error?: string;
    code?: string;
    mode?: 'leave' | 'owner_delete' | 'cancel';
    canceledSubscriptions?: string[];
    stripeSubscriptions?: { id: string; cancel_at: number | null; current_period_end: number }[];
    expiresAt?: string | null;
    invitesDeactivated?: number;
    message?: string;
    timestamp?: string;
  }

  // Pulls a useful error message out of an Amplify post() rejection. Amplify
  // wraps non-2xx HTTP responses in errors whose body is buried under
  // err._response.body — extract it here so callers can show something more
  // helpful than "Unknown error".
  const parseAmplifyError = (error: unknown, fallback = 'Unknown error occurred'): string => {
    if (typeof error === 'object' && error !== null) {
      const err = error as any;
      if (err._response?.body) {
        try {
          const bodyError =
            typeof err._response.body === 'string'
              ? JSON.parse(err._response.body)
              : err._response.body;
          return bodyError.error || bodyError.message || fallback;
        } catch {
          return typeof err._response.body === 'string' ? err._response.body : fallback;
        }
      }
      if (err.message) return err.message;
    }
    if (error instanceof Error) return error.message;
    return fallback;
  };

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
          isOwner: t.is_owner === true || t.is_owner?.BOOL === true,
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
              const result = (await body.json()) as DeleteAccountResponse;

              console.log('📦 Delete account result:', result);

              if (result?.success === false) {
                Alert.alert('Error', result.error || 'Failed to delete account.');
                return;
              }

              await deleteUser();
              Alert.alert('Account Deleted', 'Your account has been permanently removed.');
            } catch (error) {
              console.error('❌ Error deleting account:', error);
              Alert.alert('Error', `Failed to delete account: ${parseAmplifyError(error)}`);
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

      // Show selected image immediately
      setImageUrl(uri);

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

      const { url } = await getUrl({
        key,
        options: {
          accessLevel: 'private',
          validateObjectExistence: true,
          expiresIn: 3600,
        },
      });

      setImageUrl(`${url.toString()}&t=${Date.now()}`);
    } catch (err) {
      console.error('❌ Upload error:', err);
      Alert.alert('Upload Failed', 'Could not upload profile photo.');
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

  // ─── TRANSFER OWNERSHIP (TEMPORARILY DISABLED) ────────────────────────────
  // The transfer-ownership UI is hidden for the initial release. Backend
  // lambda (transferGroupOwnsership) remains deployable. To re-enable:
  // (1) uncomment the handler below, (2) uncomment the Transfer button in
  // the passes.map JSX.
  //
  // const handleTransferOwnership = (groupId: string) => {
  //   Alert.prompt(
  //     'Transfer Group Ownership',
  //     'Enter the username of the new group owner. They must already be a member of this group.',
  //     async (newOwnerUsername) => {
  //       if (!newOwnerUsername?.trim()) return;
  //       try {
  //         const response = await post({
  //           apiName: 'apiNightline',
  //           path: '/transferGroupOwnership',
  //           options: {
  //             body: {
  //               currentOwnerId: user?.userId,
  //               newOwnerUsername: newOwnerUsername.trim(),
  //               groupId,
  //             },
  //           },
  //         });
  //         const { body } = await response.response;
  //         const result = (await body.json()) as unknown as TransferOwnershipResponse;
  //         if (result.success === false) {
  //           Alert.alert('Error', result.error || 'Failed to transfer ownership.');
  //           return;
  //         }
  //         Alert.alert(
  //           'Ownership Transferred',
  //           `Group ownership has been transferred to ${newOwnerUsername}.`
  //         );
  //         await fetchMembershipTokens();
  //       } catch (error) {
  //         console.error('❌ Error transferring ownership:', error);
  //         Alert.alert('Error', 'Failed to transfer ownership. Please try again.');
  //       }
  //     },
  //     'plain-text'
  //   );
  // };

  // ─── GREEK — non-owner leaves the group ────────────────────────────────────
  // Posts /delete-membership with mode='leave'. The lambda only deactivates
  // THIS user's MEMBER row + their tokens for this group. METADATA, other
  // members, and Stripe are untouched. Owners are rejected upstream with
  // OWNER_CANNOT_LEAVE — they must use the Delete subscription action below.
  const leaveGreekMembership = (groupId: string) => {
    if (!groupId || !user?.userId) return;
    Alert.alert(
      'Leave this group?',
      "You'll lose access to this Greek pass right away. The group itself and the billing owner's subscription are unaffected.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              setMembershipRefreshing(true);
              const response = await post({
                apiName: 'apiNightline',
                path: '/delete-membership',
                options: {
                  body: { userId: user.userId, groupId, mode: 'leave' },
                },
              });
              const { body } = await response.response;
              const result = (await body.json()) as unknown as DeleteMembershipFlowResponse;
              if (result.success === false) {
                Alert.alert('Could not leave', result.error || 'Please try again.');
                return;
              }
              await fetchMembershipTokens();
              Alert.alert("You've left", "You're no longer in this group.");
            } catch (error) {
              console.error('❌ Error leaving membership:', error);
              Alert.alert('Could not leave', parseAmplifyError(error, 'Failed to leave the group.'));
            } finally {
              setMembershipRefreshing(false);
            }
          },
        },
      ]
    );
  };

  // ─── GREEK — billing owner schedules cancel-at-period-end ──────────────────
  // Posts /delete-membership with mode='owner_delete'. The lambda flips the
  // Greek subscription on Stripe to cancel_at_period_end=true (so the owner
  // finishes paying out the current term, with no refund) and stamps the
  // cancel intent onto METADATA. Members keep full access until the natural
  // expires_at lifecycle (read_only → suspended → deleted) winds the group
  // down. Outstanding invite codes are deactivated immediately so nobody new
  // can join a winding-down workspace.
  const ownerDeleteGreekSubscription = (groupId: string) => {
    if (!groupId || !user?.userId) return;
    Alert.alert(
      'Delete this subscription?',
      "Your Greek subscription will stop auto-renewing. You and your members keep full access until the end of the term you've already paid for, and Stripe won't charge you again after that. This can't be undone from the app — contact billing if you change your mind.",
      [
        { text: 'Keep subscription', style: 'cancel' },
        {
          text: 'Delete subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              setMembershipRefreshing(true);
              const response = await post({
                apiName: 'apiNightline',
                path: '/delete-membership',
                options: {
                  body: { userId: user.userId, groupId, mode: 'owner_delete' },
                },
              });
              const { body } = await response.response;
              const result = (await body.json()) as unknown as DeleteMembershipFlowResponse;
              if (result.success === false) {
                Alert.alert('Could not delete', result.error || 'Please try again.');
                return;
              }
              await fetchMembershipTokens();
              const endDate = result.expiresAt
                ? new Date(result.expiresAt).toLocaleDateString()
                : null;
              Alert.alert(
                'Subscription scheduled to end',
                endDate
                  ? `You and your members keep access through ${endDate}. Stripe won't charge you again.`
                  : "You and your members keep access through the end of the current term. Stripe won't charge you again."
              );
            } catch (error) {
              console.error('❌ Error deleting subscription:', error);
              Alert.alert(
                'Could not delete',
                parseAmplifyError(error, 'Failed to schedule cancellation. Stripe may be unreachable — try again in a minute.')
              );
            } finally {
              setMembershipRefreshing(false);
            }
          },
        },
      ]
    );
  };

  // ─── NON-GREEK — immediate cancel for Individual/Group/Night/Bus ──────────
  // Posts /delete-membership without a mode. The lambda falls through to the
  // immediate-cancel branch: DB inactive, then Stripe cancel on THIS group's
  // subscription only (never the customer's full sub list — that bug was
  // fixed earlier). Greek plans hit the dedicated handlers above and never
  // reach this function.
  const cancelNonGreekMembership = (groupId: string) => {
    if (!groupId || !user?.userId) return;
    Alert.alert(
      'Cancel membership?',
      'Are you sure you want to cancel this [membership]? This action cannot be undone.',
      [
        { text: 'Keep membership', style: 'cancel' },
        {
          text: 'Cancel membership',
          style: 'destructive',
          onPress: async () => {
            try {
              setMembershipRefreshing(true);
              const response = await post({
                apiName: 'apiNightline',
                path: '/delete-membership',
                options: { body: { userId: user.userId, groupId } },
              });
              const { body } = await response.response;
              const result = (await body.json()) as unknown as DeleteMembershipFlowResponse;
              if (result.success === false) {
                Alert.alert('Error', result.error || 'Failed to cancel subscription.');
                return;
              }
              await fetchMembershipTokens();
              Alert.alert('Canceled', 'Your membership has been canceled.');
            } catch (error) {
              console.error('❌ Error canceling membership:', error);
              Alert.alert('Error', `Failed to cancel membership: ${parseAmplifyError(error)}`);
            } finally {
              setMembershipRefreshing(false);
            }
          },
        },
      ]
    );
  };

  //Same as above, but it calls a membership a pass to avoid confusion for non-Greek users. The lambda logic is identical — the mode param is what drives the flow, and Greek passes are blocked from hitting this function at all.
  const cancelNonGreekPass = (groupId: string) => {
    if (!groupId || !user?.userId) return;
    Alert.alert(
      'Cancel pass?',
      'Are you sure you want to cancel this [pass]? This action cannot be undone.',
      [
        { text: 'Keep pass', style: 'cancel' },
        {
          text: 'Cancel pass',
          style: 'destructive',
          onPress: async () => {
            try {
              setMembershipRefreshing(true);
              const response = await post({
                apiName: 'apiNightline',
                path: '/delete-membership',
                options: { body: { userId: user.userId, groupId } },
              });
              const { body } = await response.response;
              const result = (await body.json()) as unknown as DeleteMembershipFlowResponse;
              if (result.success === false) {
                Alert.alert('Error', result.error || 'Failed to cancel pass.');
                return;
              }
              await fetchMembershipTokens();
              Alert.alert('Canceled', 'Your pass has been canceled.');
            } catch (error) {
              console.error('❌ Error canceling pass:', error);
              Alert.alert('Error', `Failed to cancel pass: ${parseAmplifyError(error)}`);
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

  // Greek plans get the dedicated leave / owner-delete handlers above.
  // Anything else uses the immediate-cancel path.
  const isGreekPass = (groupId: string) => (groupId || '').toLowerCase().startsWith('greek');
  const isNightPass = (groupId: string) => (groupId || '').toLowerCase().startsWith('nig');
  const isBusPass = (groupId: string) => (groupId || '').toLowerCase().startsWith('bus');

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
                const greek = isGreekPass(p.groupId);
                const isOwner = p.isOwner === true;
                const nightPass = isNightPass(p.groupId);
                const busPass = isBusPass(p.groupId);

                // Pick the action button based on (greek, isOwner):
                //   Greek + owner  → "Delete subscription" (owner_delete mode,
                //                    cancel_at_period_end; members keep access)
                //   Greek + member → "Leave"               (leave mode, only
                //                    this user's row + tokens flip)
                //   Non-Greek      → "Cancel subscription" (immediate cancel)
                let actionLabel: string;
                let onActionPress: () => void;
                if (greek && isOwner) {
                  actionLabel = 'Delete subscription';
                  onActionPress = () => ownerDeleteGreekSubscription(p.groupId);
                } else if (greek) {
                  actionLabel = 'Leave';
                  onActionPress = () => leaveGreekMembership(p.groupId);
                } else if (nightPass || busPass) {
                  actionLabel = 'Delete pass';
                  onActionPress = () => cancelNonGreekPass(p.groupId);
                } else {
                  actionLabel = 'Cancel subscription';
                  onActionPress = () => cancelNonGreekMembership(p.groupId);
                }

                return (
                  <View key={p.tokenId || i}>
                    <View style={styles.settingItem}>
                      <View style={styles.settingInfo}>
                        <View style={styles.settingTitle}>
                          <MapPin size={18} color={colors.primary} />
                          <Text style={styles.settingText}>{getPassType(p.groupId)}</Text>
                        </View>
                        {isOwner && (
                          <Text style={{ fontSize: 11, color: colors.textLight, alignSelf: 'flex-start', marginTop: 10, marginLeft: 30, }}>
                            Owner
                          </Text>
                        )}
                      </View>

                      <View style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
                        {/* Transfer-ownership button — disabled for the
                            initial release. Re-enable alongside the
                            handleTransferOwnership handler above.
                        {isOwner && greek && (
                          <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => handleTransferOwnership(p.groupId)}
                          >
                            <Text style={styles.modalButtonConfirmText}>Transfer Ownership</Text>
                          </TouchableOpacity>
                        )}
                        */}
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={onActionPress}
                        >
                          <Text style={[styles.modalButtonConfirmText, { color: 'red' }]}>
                            {actionLabel}
                          </Text>
                        </TouchableOpacity>
                      </View>
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
