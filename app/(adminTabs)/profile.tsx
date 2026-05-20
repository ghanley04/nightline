import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, Switch, TextInput, Modal, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { User, Mail, Phone, Bell, CreditCard, Camera, MapPin /*, UserCheck, AlertTriangle */ } from 'lucide-react-native';
// NOTE: UserCheck + AlertTriangle are imported by the transfer-ownership UI,
// which is currently disabled. Re-add them to the import when re-enabling.
import Card from '@/components/Card';
import Button from '@/components/Button';
import colors from '../../constants/colors';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import { signOut, deleteUser, fetchUserAttributes, UserAttributeKey, updateUserAttributes, confirmUserAttribute, getCurrentUser } from 'aws-amplify/auth';
import type { VerifiableUserAttributeKey } from "@aws-amplify/auth";
import * as ImagePicker from 'expo-image-picker';
import { uploadData, getUrl, remove } from 'aws-amplify/storage';
import { getJwtToken } from "../auth/auth";
import { MembershipResponse, InviteResponse } from '../interfaces/interface';
import { get, post } from 'aws-amplify/api';

export async function getUserAttributes() {
  try {
    const userAttributes = await fetchUserAttributes();
    return userAttributes;
  } catch (error) {
    // console.error('Error fetching user attributes:', error);
    return null;
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuthenticator(context => [context.user]);
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [attributes, setAttributes] = useState<Partial<Record<UserAttributeKey, string>> | null>(null);
  const firstName = attributes?.given_name || '';
  const lastName = attributes?.family_name || '';
  const [passes, setPasses] = useState<{ groupId: string; id: string; tokenId: string; isOwner?: boolean }[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  
  // --- TRANSFER OWNERSHIP (TEMPORARILY DISABLED) ----------------------------
  // The transfer-ownership modal is commented out for the first release. The
  // backend lambdas (transferGroupOwnsership, acceptTransfer) are still in
  // place and will work once this UI is re-enabled. Uncomment the state, the
  // helper functions below, the Transfer button in the passes map, and the
  // Transfer Modal JSX to bring the flow back.
  //
  // const [transferModal, setTransferModal] = useState<{
  //   visible: boolean;
  //   groupId: string | null;
  //   path: 'A' | 'B' | null;
  //   newOwnerUsername: string;
  //   newOwnerEmail: string;
  //   accepted: boolean;
  //   submitting: boolean;
  // }>({
  //   visible: false,
  //   groupId: null,
  //   path: null,
  //   newOwnerUsername: '',
  //   newOwnerEmail: '',
  //   accepted: false,
  //   submitting: false,
  // });
  // --------------------------------------------------------------------------
  const [draftAttributes, setDraftAttributes] = useState<Partial<Record<UserAttributeKey, string>> | null>(null);
  const fullName = (firstName && lastName)
    ? `${firstName} ${lastName}`
    : attributes?.username;

  useEffect(() => {
    const fetchAndSetAttributes = async () => {
      if (authStatus === 'authenticated') {
        const userAttributes = await getUserAttributes();
        setAttributes(userAttributes);
        setDraftAttributes(userAttributes);
      }
    };
    fetchAndSetAttributes();
    fetchMembershipTokens();
  }, [authStatus]);

  const fetchMembershipTokens = useCallback(async () => {
    const token = await getJwtToken();
    try {
      const response = await get({
        apiName: "apiNightline",
        path: "/fetchMembership",
        options: { queryParams: { userId: user.userId } },
      });
      const { body } = await response.response;
      const rawData = await body.json();
      const data = rawData as unknown as MembershipResponse;

      if (data.hasMembership && data.tokens && data.tokens.length > 0) {
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
      console.error('Error fetching membership token:', err);
    }
  }, [user]);

  const handleInputChange = (key: UserAttributeKey, value: string) => {
    setDraftAttributes(prev => ({ ...prev, [key]: value }));
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
                await remove({ key: `profile/${user.userId}.jpg`, options: { accessLevel: 'private' } });
              } catch (s3Error) {
                console.warn('Could not remove profile photo:', s3Error);
              }

              const response = await post({
                apiName: "apiNightline",
                path: "/delete-account",
                options: { body: { userId: user.userId, reason: 'user_requested_deletion' } },
              });
              const { body } = await response.response;
              const result = await body.json();

              if (result?.success === false) {
                Alert.alert('Error', result.error || 'Failed to delete account.');
                return;
              }
              await deleteUser();
              Alert.alert('Account Deleted', 'Your account has been permanently removed.');
            } catch (error) {
              let errorMessage = 'Unknown error occurred';
              if (typeof error === 'object' && error !== null) {
                const err = error as any;
                if (err._response?.body) {
                  try {
                    const bodyError = typeof err._response.body === 'string'
                      ? JSON.parse(err._response.body) : err._response.body;
                    errorMessage = bodyError.error || bodyError.message || errorMessage;
                  } catch (e) { errorMessage = err._response.body; }
                } else if (err.message) { errorMessage = err.message; }
              }
              Alert.alert('Error', `Failed to delete account: ${errorMessage}`);
            }
          },
          style: 'destructive'
        }
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
      Alert.alert("No Changes", "No profile changes were detected.");
      setIsEditing(false);
      return;
    }

    try {
      const output = await updateUserAttributes({ userAttributes: attributesToUpdate });
      let verificationRequired = false;
      let pendingAttribute: UserAttributeKey | null = null;
      let destination: string | undefined;

      for (const key of Object.keys(output) as UserAttributeKey[]) {
        const attrResult = output[key];
        if (attrResult?.nextStep?.updateAttributeStep === 'CONFIRM_ATTRIBUTE_WITH_CODE') {
          verificationRequired = true;
          pendingAttribute = key;
          destination = attrResult.nextStep.codeDeliveryDetails?.destination;
          break;
        }
      }

      if (verificationRequired && pendingAttribute) {
        setVerificationState({ attributeKey: pendingAttribute, showModal: true, code: '' });
        setDraftAttributes(attributes || {});
        setIsEditing(false);
        return;
      }

      Alert.alert("Success", "Your profile has been updated.");
      const updatedAttributes = await getUserAttributes();
      setAttributes(updatedAttributes);
      setDraftAttributes(updatedAttributes || {});
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
      Alert.alert("Invalid Verification", "Only email or phone number can be verified.");
      return;
    }
    try {
      await confirmUserAttribute({
        userAttributeKey: attributeKey as VerifiableUserAttributeKey,
        confirmationCode: code,
      });
      Alert.alert("Confirmed", "Your new contact information is now verified and saved.");
      const updatedAttributes = await getUserAttributes();
      setAttributes(updatedAttributes);
      setDraftAttributes(updatedAttributes || {});
    } catch (error) {
      console.error('Error confirming attribute:', error);
      Alert.alert('Verification Failed', 'The code was incorrect or expired. Please try updating again.');
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
        options: { accessLevel: 'private', contentType: 'image/jpeg' },
      });
      await upload.result;
      await fetchProfilePhoto();
    } catch (err) {
      console.error('Upload error:', err);
    }
  }

  const [imageUrl, setImageUrl] = useState('');

  async function fetchProfilePhoto() {
    try {
      const currentUser = await getCurrentUser();
      const key = `profile/${currentUser.userId}.jpg`;
      const { url } = await getUrl({
        key,
        options: { accessLevel: 'private', validateObjectExistence: true, expiresIn: 3600 },
      });
      setImageUrl(url.toString());
    } catch (err) {
      console.error('Fetch photo error:', err);
    }
  }

  useEffect(() => {
    const fetchAndSetAttributes = async () => {
      if (authStatus === 'authenticated') {
        const userAttributes = await getUserAttributes();
        setAttributes(userAttributes);
        setDraftAttributes(userAttributes);
        await fetchProfilePhoto();
      }
    };
    fetchAndSetAttributes();
  }, [authStatus]);

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
        { text: 'Logout', onPress: () => signOut(), style: 'destructive' }
      ]
    );
  };

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

  // Pull a useful error message out of an Amplify post() rejection.
  const parseAmplifyError = (error: unknown, fallback = 'Unknown error occurred') => {
    if (typeof error === 'object' && error !== null) {
      const err = error as any;
      if (err._response?.body) {
        try {
          const bodyError = typeof err._response.body === 'string'
            ? JSON.parse(err._response.body) : err._response.body;
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

  interface DeleteMembershipFlowResponse {
    success: boolean;
    error?: string;
    code?: string;
    mode?: 'leave' | 'owner_delete' | 'cancel';
    canceledSubscriptions?: string[];
    stripeSubscriptions?: { id: string; cancel_at: number | null; current_period_end: number }[];
    expiresAt?: string | null;
    message?: string;
    timestamp?: string;
  }

  // GREEK — non-owner member leaves the group. Only deactivates their own
  // MEMBER row + tokens; leaves METADATA, Stripe, and other members alone.
  const leaveGreekMembership = async (groupId: string) => {
    if (!groupId) return;
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
              const response = await post({
                apiName: 'apiNightline',
                path: '/delete-membership',
                options: { body: { userId: user.userId, groupId, mode: 'leave' } },
              });
              const { body } = await response.response;
              const result = (await body.json()) as unknown as DeleteMembershipFlowResponse;
              if (result.success === false) {
                Alert.alert('Could not leave', result.error || 'Please try again.');
                return;
              }
              await new Promise(r => setTimeout(r, 800));
              await fetchMembershipTokens();
              Alert.alert("You've left", "You're no longer in this group.");
            } catch (error) {
              Alert.alert('Could not leave', parseAmplifyError(error, 'Failed to leave the group.'));
            }
          },
        },
      ]
    );
  };

  // GREEK — billing owner schedules the subscription to end at the period
  // boundary. Stripe is flipped to cancel_at_period_end=true; members keep
  // full access until the workspace naturally hits expires_at.
  const ownerDeleteGreekSubscription = async (groupId: string) => {
    if (!groupId) return;
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
              const response = await post({
                apiName: 'apiNightline',
                path: '/delete-membership',
                options: { body: { userId: user.userId, groupId, mode: 'owner_delete' } },
              });
              const { body } = await response.response;
              const result = (await body.json()) as unknown as DeleteMembershipFlowResponse;
              if (result.success === false) {
                Alert.alert('Could not delete', result.error || 'Please try again.');
                return;
              }
              await new Promise(r => setTimeout(r, 800));
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
              Alert.alert(
                'Could not delete',
                parseAmplifyError(error, 'Failed to schedule cancellation. Stripe may be unreachable — try again in a minute.')
              );
            }
          },
        },
      ]
    );
  };

  const deleteMembership = async (groupId: string) => {
    if (!groupId) return;
    // Greek plans use the dedicated leave / owner-delete flows above.
    // Anything reaching this function is non-Greek (Individual / Group /
    // Night / Bus) and takes the immediate-cancel path.
    if (isGreekPass(groupId)) {
      handleGreekCancelRequest();
      return;
    }
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
              const response = await post({
                apiName: "apiNightline",
                path: "/delete-membership",
                options: { body: { userId: user.userId, groupId } },
              });
              const { body } = await response.response;
              const rawResult = await body.json();
              const result = rawResult as unknown as DeleteMembershipResponse;

              if (result.success === false) {
                Alert.alert('Error', result.error || 'Failed to delete subscription.');
                return;
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
              await fetchMembershipTokens();
              Alert.alert('Success', 'Your subscription has been deleted successfully.');
            } catch (error) {
              let errorMessage = 'Unknown error occurred';
              if (typeof error === 'object' && error !== null) {
                const err = error as any;
                if (err._response?.body) {
                  try {
                    const bodyError = typeof err._response.body === 'string'
                      ? JSON.parse(err._response.body) : err._response.body;
                    errorMessage = bodyError.error || bodyError.message || errorMessage;
                  } catch { errorMessage = err._response.body; }
                } else if (err.message) { errorMessage = err.message; }
              } else if (error instanceof Error) { errorMessage = error.message; }
              Alert.alert('Error', `Failed to delete subscription: ${errorMessage}`);
            }
          }
        }
      ]
    );
  };

  const getPassType = (groupId: string) => {
    if (!groupId) return 'Unknown';
    const prefix = groupId.slice(0, 3).toLowerCase();
    switch (prefix) {
      case 'ind': return 'Individual Pass';
      case 'nig': return 'Night Pass';
      case 'gre': return 'Greek Pass';
      case 'gro': return 'Group Pass';
      default: return 'Unknown Pass';
    }
  };

  // Greek subscriptions are fixed-term and non-cancellable from the app.
  // Anywhere the UI would offer cancel we instead point the user at
  // billing@nightlinecomo.com.
  const isGreekPass = (groupId: string) => (groupId || '').toLowerCase().startsWith('greek');

  // --- TRANSFER OWNERSHIP HELPERS (TEMPORARILY DISABLED) --------------------
  // These helpers back the Transfer Ownership modal, which has been commented
  // out below. Keep them in sync if you re-enable the flow.
  //
  // // Exact warning copy the user must see + agree to BEFORE the transfer
  // // lambda will proceed. We send this string to the backend, which logs it
  // // verbatim on TRANSFER_LOG so the audit trail shows what was agreed to.
  // const PATH_A_WARNING =
  //   "Path A — I will keep paying. The new admin gets the ability to DELETE this workspace. My subscription continues through its current expiry date regardless. If the new admin deletes the workspace, I do NOT get a refund for the unused time.";
  // const PATH_B_WARNING =
  //   "Path B — New owner takes over future billing. Nothing moves mid-term; the current term stays paid by me. When the current term expires, the new owner is responsible for arranging the next year's subscription with billing@nightlinecomo.com.";
  //
  // const openTransferModal = (groupId: string) => {
  //   setTransferModal({
  //     visible: true,
  //     groupId,
  //     path: null,
  //     newOwnerUsername: '',
  //     newOwnerEmail: '',
  //     accepted: false,
  //     submitting: false,
  //   });
  // };
  //
  // const closeTransferModal = () => {
  //   setTransferModal({
  //     visible: false,
  //     groupId: null,
  //     path: null,
  //     newOwnerUsername: '',
  //     newOwnerEmail: '',
  //     accepted: false,
  //     submitting: false,
  //   });
  // };
  //
  // const submitTransfer = async () => {
  //   const { groupId, path, newOwnerUsername, newOwnerEmail, accepted } = transferModal;
  //   if (!groupId || !path) return;
  //   if (!accepted) {
  //     Alert.alert('Confirmation required', 'You must acknowledge the warning before transferring ownership.');
  //     return;
  //   }
  //   if (path === 'A' && !newOwnerUsername.trim()) {
  //     Alert.alert('Missing info', 'Enter the new owner\'s username (Path A requires them to already be a member).');
  //     return;
  //   }
  //   if (path === 'B' && !newOwnerEmail.trim()) {
  //     Alert.alert('Missing info', 'Enter the new owner\'s email address so we can send the invite.');
  //     return;
  //   }
  //
  //   setTransferModal(prev => ({ ...prev, submitting: true }));
  //
  //   try {
  //     const response = await post({
  //       apiName: 'apiNightline',
  //       path: '/transfer-group-ownership',
  //       options: {
  //         body: {
  //           path,
  //           currentOwnerId: user.userId,
  //           groupId,
  //           warningAccepted: true,
  //           warningTextShown: path === 'A' ? PATH_A_WARNING : PATH_B_WARNING,
  //           newOwnerUsername: path === 'A' ? newOwnerUsername.trim() : undefined,
  //           newOwnerEmail: path === 'B' ? newOwnerEmail.trim().toLowerCase() : undefined,
  //         },
  //       },
  //     });
  //     const { body } = await response.response;
  //     const result = (await body.json()) as unknown as { success?: boolean; error?: string; message?: string };
  //
  //     if (result?.success === false) {
  //       Alert.alert('Transfer failed', result.error || 'Could not complete the transfer.');
  //       setTransferModal(prev => ({ ...prev, submitting: false }));
  //       return;
  //     }
  //     closeTransferModal();
  //     Alert.alert(
  //       path === 'A' ? 'Admin rights transferred' : 'Invitation sent',
  //       path === 'A'
  //         ? 'Admin ownership has been transferred. You remain the billing owner until the subscription expires.'
  //         : 'We emailed the new owner an invitation. The transfer completes once they accept. Nothing has changed yet.'
  //     );
  //     await fetchMembershipTokens();
  //   } catch (error) {
  //     let errorMessage = 'Unknown error';
  //     if (typeof error === 'object' && error !== null) {
  //       const err = error as any;
  //       if (err._response?.body) {
  //         try {
  //           const bodyError = typeof err._response.body === 'string' ? JSON.parse(err._response.body) : err._response.body;
  //           errorMessage = bodyError.error || bodyError.message || errorMessage;
  //         } catch { errorMessage = err._response.body; }
  //       } else if (err.message) { errorMessage = err.message; }
  //     }
  //     Alert.alert('Transfer failed', errorMessage);
  //     setTransferModal(prev => ({ ...prev, submitting: false }));
  //   }
  // };
  // --------------------------------------------------------------------------

  // Shown in place of the cancel button for Greek passes — directs to billing
  // rather than offering a self-serve action that the backend will reject anyway.
  const handleGreekCancelRequest = () => {
    Alert.alert(
      'Greek subscriptions',
      "Greek subscriptions can't be cancelled from the app. Your subscription runs through its expiry date. To make changes, email billing@nightlinecomo.com.",
      [
        { text: 'Close', style: 'cancel' },
        {
          text: 'Email billing',
          onPress: () => Linking.openURL('mailto:billing@nightlinecomo.com?subject=Greek%20subscription%20question'),
        },
      ]
    );
  };

  const renderInfoField = (
    label: string,
    key: UserAttributeKey,
    value: string,
    icon: JSX.Element,
    type: string = 'default'
  ) => (
    <View>
      <View style={styles.infoItem}>
        <View style={styles.infoIcon}>{icon}</View>
        <View style={styles.infoContent}>
          <Text style={styles.infoLabel}>{label}</Text>
          {isEditing ? (
            <TextInput
              style={styles.inlineInput}
              value={draftAttributes?.[key] ?? ""}
              onChangeText={(text) => handleInputChange(key, text)}
              placeholder={value || `Enter ${label.toLowerCase()}`}
              placeholderTextColor={colors.textMuted}
              keyboardType={type as any}
              selectionColor={colors.primary}
            />
          ) : (
            <Text style={styles.infoValue}>{value || '—'}</Text>
          )}
        </View>
      </View>
      <View style={styles.divider} />
    </View>
  );

  // Avatar initials
  const initials = (
    (attributes?.given_name?.charAt(0) || '') +
    (attributes?.family_name?.charAt(0) || '') ||
    user?.username?.charAt(0) ||
    'U'
  ).toUpperCase();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.photoContainer}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>{initials}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.cameraButton} onPress={pickAndUploadProfilePhoto}>
              <Camera size={14} color="#0A0A0F" />
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{fullName || user?.username}</Text>
          <Text style={styles.userType}>Nightline Member</Text>
        </View>

        {/* Personal Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <Card style={styles.infoCard}>
            {renderInfoField('First Name', 'given_name', draftAttributes?.given_name || '', <User size={18} color={colors.primary} />)}
            {renderInfoField('Last Name', 'family_name', draftAttributes?.family_name || '', <User size={18} color={colors.primary} />)}
            {renderInfoField('Email', 'email', draftAttributes?.email || '', <Mail size={18} color={colors.primary} />, 'email-address')}
            {renderInfoField('Phone', 'phone_number', draftAttributes?.phone_number || '', <Phone size={18} color={colors.primary} />, 'phone')}
          </Card>

          {/* Verification modal */}
          <Modal
            visible={verificationState.showModal}
            transparent
            animationType="fade"
            onRequestClose={() => setVerificationState({ showModal: false, code: '' })}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalView}>
                <Text style={styles.modalTitle}>Verify Your Update</Text>
                <Text style={styles.modalSubtitle}>Enter the code sent to your contact info</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.textMuted}
                  value={verificationState.code}
                  onChangeText={(text) => setVerificationState(prev => ({ ...prev, code: text }))}
                  keyboardType="numeric"
                  selectionColor={colors.primary}
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

          {/* Edit / Save / Cancel */}
          {isEditing ? (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editButton} onPress={handleCancel}>
                <Text style={styles.editButtonTextMuted}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editButton, styles.saveButton]} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
              <Text style={styles.modalButtonConfirmText}>Edit Information</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Subscriptions — one row per active pass. Greek passes get a
            "Transfer Ownership" button + a "Cancel" button that routes to
            billing instead of the API. Non-Greek passes keep the standard
            cancel flow. */}
        {passes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Subscriptions</Text>
            <Card style={styles.infoCard}>
              {passes.map((pass, idx) => {
                const greek = isGreekPass(pass.groupId);
                const isOwner = pass.isOwner === true;
                // Transfer UI is disabled for the initial release — leaving
                // the computed flag here (as a const, unused) so re-enabling
                // the button below is a one-line change.
                // const showTransfer = greek && isOwner;
                //
                // Action button selection:
                //   - Greek + owner  → "Delete subscription" (cancel_at_period_end)
                //   - Greek + member → "Leave" (deactivates own row only)
                //   - Non-Greek      → "Cancel" (immediate Stripe cancel)
                let actionLabel: string;
                let onActionPress: () => void;
                if (greek && isOwner) {
                  actionLabel = 'Delete subscription';
                  onActionPress = () => ownerDeleteGreekSubscription(pass.groupId);
                } else if (greek) {
                  actionLabel = 'Leave';
                  onActionPress = () => leaveGreekMembership(pass.groupId);
                } else {
                  actionLabel = 'Cancel';
                  onActionPress = () => deleteMembership(pass.groupId);
                }
                return (
                  <View key={pass.id}>
                    <View style={styles.passRow}>
                      <View style={styles.passInfo}>
                        <Text style={styles.passType}>{getPassType(pass.groupId)}</Text>
                        <Text style={styles.passGroupId} numberOfLines={1}>{pass.groupId}</Text>
                      </View>
                      <View style={styles.passActions}>
                        {/* Transfer button — disabled until the transfer-ownership
                            UI is re-enabled. Backend lambdas still exist.
                        {showTransfer && (
                          <TouchableOpacity
                            style={styles.passActionButton}
                            onPress={() => openTransferModal(pass.groupId)}
                          >
                            <UserCheck size={14} color={colors.primary} />
                            <Text style={styles.passActionText}>Transfer</Text>
                          </TouchableOpacity>
                        )}
                        */}
                        <TouchableOpacity
                          style={styles.passActionButton}
                          onPress={onActionPress}
                        >
                          <Text style={[styles.passActionText, { color: colors.textSecondary }]}>
                            {actionLabel}
                          </Text>
                        </TouchableOpacity>
                        {greek && (
                          <TouchableOpacity
                            style={styles.passActionButton}
                            onPress={handleGreekCancelRequest}
                          >
                            <Text style={[styles.passActionText, { color: colors.textMuted }]}>
                              Contact billing
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    {idx < passes.length - 1 && <View style={styles.divider} />}
                  </View>
                );
              })}
            </Card>
          </View>
        )}

        {/* TRANSFER OWNERSHIP MODAL — TEMPORARILY DISABLED.
            Two paths, explicit warning + required acceptance checkbox. The
            exact warning copy is also sent to the backend (logged verbatim on
            TRANSFER_LOG for audit). To re-enable: uncomment the transferModal
            state, the PATH_A/B warnings, open/close/submit helpers, the
            Transfer button in the passes map, and remove the JSX comment
            wrapper around this block.

        <Modal
          visible={transferModal.visible}
          transparent
          animationType="fade"
          onRequestClose={closeTransferModal}
        >
          <View style={styles.modalContainer}>
            <View style={[styles.modalView, { width: '92%' }]}>
              <Text style={styles.modalTitle}>Transfer Ownership</Text>
              <Text style={styles.modalSubtitle}>
                Choose a transfer path. Each has different consequences for who pays.
              </Text>

              <View style={styles.pathPickerRow}>
                <TouchableOpacity
                  style={[
                    styles.pathOption,
                    transferModal.path === 'A' && styles.pathOptionSelected,
                  ]}
                  onPress={() => setTransferModal(prev => ({ ...prev, path: 'A', accepted: false }))}
                >
                  <Text style={styles.pathOptionTitle}>A — I keep paying</Text>
                  <Text style={styles.pathOptionBody}>
                    New admin gets delete rights. I stay the billing owner
                    through the current term. No refund if they delete it.
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.pathOption,
                    transferModal.path === 'B' && styles.pathOptionSelected,
                  ]}
                  onPress={() => setTransferModal(prev => ({ ...prev, path: 'B', accepted: false }))}
                >
                  <Text style={styles.pathOptionTitle}>B — Hand off future billing</Text>
                  <Text style={styles.pathOptionBody}>
                    Nothing moves mid-term. When this term ends, the new owner
                    arranges next year with billing@nightlinecomo.com.
                  </Text>
                </TouchableOpacity>
              </View>

              {transferModal.path === 'A' && (
                <>
                  <TextInput
                    style={styles.modalInputPlain}
                    placeholder="New owner's username (must be an existing member)"
                    placeholderTextColor={colors.textMuted}
                    value={transferModal.newOwnerUsername}
                    onChangeText={(t) => setTransferModal(prev => ({ ...prev, newOwnerUsername: t }))}
                    autoCapitalize="none"
                    selectionColor={colors.primary}
                  />
                  <View style={styles.warningBox}>
                    <AlertTriangle size={16} color="#b00" />
                    <Text style={styles.warningText}>{PATH_A_WARNING}</Text>
                  </View>
                </>
              )}

              {transferModal.path === 'B' && (
                <>
                  <TextInput
                    style={styles.modalInputPlain}
                    placeholder="New owner's email"
                    placeholderTextColor={colors.textMuted}
                    value={transferModal.newOwnerEmail}
                    onChangeText={(t) => setTransferModal(prev => ({ ...prev, newOwnerEmail: t }))}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={colors.primary}
                  />
                  <View style={styles.warningBox}>
                    <AlertTriangle size={16} color="#b00" />
                    <Text style={styles.warningText}>{PATH_B_WARNING}</Text>
                  </View>
                </>
              )}

              {transferModal.path && (
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setTransferModal(prev => ({ ...prev, accepted: !prev.accepted }))}
                >
                  <View style={[styles.checkbox, transferModal.accepted && styles.checkboxChecked]}>
                    {transferModal.accepted && <Text style={styles.checkboxMark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    I have read and agree to the above.
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.modalButtonContainer}>
                <TouchableOpacity onPress={closeTransferModal} disabled={transferModal.submitting}>
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitTransfer}
                  disabled={
                    !transferModal.path ||
                    !transferModal.accepted ||
                    transferModal.submitting
                  }
                >
                  <Text
                    style={[
                      styles.modalButtonConfirmText,
                      (!transferModal.path || !transferModal.accepted || transferModal.submitting) && {
                        opacity: 0.4,
                      },
                    ]}
                  >
                    {transferModal.submitting ? 'Working…' : 'Transfer'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        */}

        {/* Actions */}
        <Button
          title="Log Out"
          onPress={handleLogout}
          variant="secondary"
          style={styles.actionButton}
        />
        <Button
          title="Delete Account"
          onPress={handleDeleteAccount}
          variant="danger"
          style={styles.actionButton}
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
    padding: 20,
    paddingBottom: 48,
  },

  // Profile header
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 8,
  },
  photoContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2.5,
    borderColor: colors.primary,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: colors.primary,
  },
  photoPlaceholderText: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.primary,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  userType: {
    fontSize: 14,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },

  // Sections
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  infoCard: {
    padding: 0,
    overflow: 'hidden',
  },
  infoItem: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  infoIcon: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    color: colors.text,
  },
  inlineInput: {
    fontSize: 15,
    color: colors.text,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginLeft: 56,
  },

  // Edit buttons
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  editButton: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  saveButton: {
    backgroundColor: colors.primaryGlow,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editButtonTextMuted: {
    color: colors.textSecondary,
    fontWeight: '500',
    fontSize: 14,
  },
  saveButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },

  // Action buttons
  actionButton: {
    marginTop: 12,
  },

  // Modal
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay,
  },
  modalView: {
    margin: 20,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 8,
    width: '85%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    height: 48,
    width: '100%',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 24,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 4,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButtonCancelText: {
    color: colors.textSecondary,
    fontWeight: '500',
    fontSize: 15,
    padding: 8,
  },
  modalButtonConfirmText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
    padding: 8,
  },

  // Subscription row
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  passInfo: {
    flex: 1,
  },
  passType: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  passGroupId: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  passActions: {
    flexDirection: 'row',
    gap: 8,
  },
  passActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  passActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },

  // Transfer modal — path picker + warning + checkbox
  pathPickerRow: {
    width: '100%',
    gap: 10,
    marginBottom: 16,
  },
  pathOption: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  pathOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  pathOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  pathOptionBody: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  modalInputPlain: {
    height: 44,
    width: '100%',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 14,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(200,0,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,0,0,0.25)',
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: '#0A0A0F',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },

  // Unused legacy styles (kept to avoid any TS errors from refs in commented-out JSX)
  userType2: { fontSize: 16, color: colors.textSecondary },
  subscriptionBadge: { backgroundColor: colors.successDim, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  subscriptionText: { color: colors.success, fontWeight: '600', fontSize: 14 },
  subscribeButton: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  subscribeText: { color: '#0A0A0F', fontWeight: '600', fontSize: 14 },
  settingsCard: { padding: 0 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  settingInfo: { flexDirection: 'row', alignItems: 'center' },
  settingTitle: { flexDirection: 'row', alignItems: 'center' },
  settingDate: { flexDirection: 'row' },
  settingText: { marginLeft: 12, fontSize: 16, color: colors.text },
  paymentCard: { padding: 16 },
  paymentMethod: { flexDirection: 'row', alignItems: 'center' },
  paymentInfo: { flex: 1, marginLeft: 12 },
  paymentTitle: { fontSize: 16, color: colors.text, fontWeight: '500' },
  paymentExpiry: { fontSize: 12, color: colors.textSecondary },
  paymentAction: { padding: 8 },
  paymentActionText: { color: colors.primary, fontWeight: '500' },
  addPaymentButton: { alignSelf: 'flex-start', marginTop: 12, padding: 8 },
  addPaymentText: { color: colors.primary, fontWeight: '500' },
  logoutButton: { marginTop: 16 },
});