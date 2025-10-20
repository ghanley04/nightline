import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, Switch, TextInput, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { User, Mail, Phone, Bell, CreditCard, Camera, MapPin } from 'lucide-react-native';
import Card from '@/components/Card';
import Button from '@/components/Button';
import colors from '../../constants/colors';
import { useAuthenticator } from '@aws-amplify/ui-react-native';
import { signOut, fetchUserAttributes, UserAttributeKey, updateUserAttributes, confirmUserAttribute, getCurrentUser } from 'aws-amplify/auth';
import type { VerifiableUserAttributeKey } from "@aws-amplify/auth";
import * as ImagePicker from 'expo-image-picker';
import { uploadData, getUrl } from 'aws-amplify/storage';

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

  // console.log("Full user object:", user);

  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [attributes, setAttributes] = useState<Partial<Record<UserAttributeKey, string>> | null>(null);
  const firstName = attributes?.given_name || '';
  const lastName = attributes?.family_name || '';

  // 1. State to track edit mode
  const [isEditing, setIsEditing] = useState(false);

  // 2. State to hold editable values (draft)
  const [draftAttributes, setDraftAttributes] = useState<Partial<Record<UserAttributeKey, string>> | null>(null);


  // Create the full name by joining them with a space
  const fullName = (firstName && lastName)
    ? `${firstName} ${lastName}`
    : attributes?.username;

  useEffect(() => {
    const fetchAndSetAttributes = async () => {
      // Only fetch attributes if the user is authenticated.
      if (authStatus === 'authenticated') {
        const userAttributes = await getUserAttributes();
        setAttributes(userAttributes);
        setDraftAttributes(userAttributes);
      }
    };

    fetchAndSetAttributes();
  }, [authStatus]);

  // Function to handle changes in text inputs
  const handleInputChange = (key: UserAttributeKey, value: string) => {
    setDraftAttributes(prev => ({
      ...prev,
      [key]: value,
    }));
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
      const output = await updateUserAttributes({
        userAttributes: attributesToUpdate,
      });

      console.log("Update result:", output);

      // Check per-attribute update results
      let verificationRequired = false;
      let pendingAttribute: UserAttributeKey | null = null;
      let destination: string | undefined;

      for (const key of Object.keys(output) as UserAttributeKey[]) {
        const attrResult = output[key];
        if (attrResult?.nextStep?.updateAttributeStep === 'CONFIRM_ATTRIBUTE_WITH_CODE') {
          verificationRequired = true;
          pendingAttribute = key;
          destination = attrResult.nextStep.codeDeliveryDetails?.destination;
          break; // handle one at a time for now
        }
      }

      if (verificationRequired && pendingAttribute) {
        // Show modal for code entry (from previous step)
        setVerificationState({
          attributeKey: pendingAttribute,
          showModal: true,
          code: '',
        });

        // Alert.alert(
        //   "Verification Required",
        //   `A code was sent to your ${pendingAttribute} ending in ${destination || '***'}. Please enter it below.`
        // );
        setDraftAttributes(attributes || {});
        setIsEditing(false);
        return;
      }

      // If no verification needed, everything was updated immediately
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

  // New function to handle the confirmation step
  const handleConfirmUpdate = async (attributeKey: UserAttributeKey, code: string) => {
    // Only verifiable attributes can be confirmed
    if (attributeKey !== 'email' && attributeKey !== 'phone_number') {
      console.warn(`Skipping confirmUserAttribute for non-verifiable key: ${attributeKey}`);
      Alert.alert(
        "Invalid Verification",
        "Only email or phone number can be verified."
      );
      return;
    }

    try {
      await confirmUserAttribute({
        userAttributeKey: attributeKey as VerifiableUserAttributeKey,
        confirmationCode: code,
      });

      Alert.alert(
        "Confirmed",
        "Your new contact information is now verified and saved."
      );

      // Refresh the user attributes to show the verified value
      const updatedAttributes = await getUserAttributes();
      setAttributes(updatedAttributes);
      setDraftAttributes(updatedAttributes || {});

    } catch (error) {
      console.error('Error confirming attribute:', error);
      Alert.alert(
        'Verification Failed',
        'The code was incorrect or expired. Please try updating your information again or request a new code.'
      );

      // Revert drafts so user data isn’t stuck in an inconsistent state
      setDraftAttributes(attributes || {});
    }
  };

  async function pickAndUploadProfilePhoto() {
    try {
      // Let user select an image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (result.canceled) return;

      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();

      // Get current authenticated user
      const user = await getCurrentUser();
      const userId = user.userId; // or user.username depending on config

      const key = `profile/${userId}.jpg`;

      // Upload image to S3
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

  const [imageUrl, setImageUrl] = useState('');

  async function fetchProfilePhoto() {
    try {
      const user = await getCurrentUser();
      const key = `profile/${user.userId}.jpg`;

      const { url } = await getUrl({
        key: key,
        options: {
          accessLevel: 'private', 
          validateObjectExistence: true, // Optional: checks if the object exists before returning a URL
          expiresIn: 3600 // Optional: URL validity in seconds (default is 900 seconds)
        },
      });

      console.log('🖼️ Fetched signed URL:', url.toString());
      setImageUrl(url.toString());
    } catch (err) {
      console.error('❌ Fetch error:', err);
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
    // Revert draft attributes to the original fetched attributes
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
          onPress: () => {
            signOut();
          },
          style: 'destructive'
        }
      ]
    );
  };

  const [verificationState, setVerificationState] = useState<{
    attributeKey?: UserAttributeKey;
    showModal: boolean;
    code: string;
  }>({ showModal: false, code: '' });


  const renderInfoField = (label: string, key: UserAttributeKey, value: string, icon: JSX.Element, type: string = 'default') => (
    <View>
      <View style={styles.infoItem}>
        <View style={styles.infoIcon}>{icon}</View>
        <View style={styles.infoContent}>
          <Text style={styles.infoLabel}>{label}</Text>
          {isEditing ? (
            <TextInput
              // style={styles.infoInput} // You'll need to define this style
              value={draftAttributes[key]}
              onChangeText={(text) => handleInputChange(key, text)}
              // type={type}
              placeholder={value}
            />
          ) : (
            <Text style={styles.infoValue}>{value}</Text>
          )}
        </View>
      </View>
      <View style={styles.divider} />
    </View>
  );

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
                  {user?.username.charAt(0) || 'U'}
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
            {user?.userId === 'individual' ? 'Individual Student' :
              user?.userId === 'greek' ? 'Greek Life Member' : 'Guest'}
          </Text>

          {/* {user?.subscriptionActive ? (
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
          )} */}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <Card style={styles.infoCard}>
            {/* Full Name (Concatenating edited names) */}
            {renderInfoField(
              'First Name',
              'given_name', // Cognito key
              draftAttributes?.given_name || '',
              <User size={18} color={colors.primary} />
            )}
            {renderInfoField(
              'Last Name',
              'family_name', // Cognito key
              draftAttributes?.family_name || '',
              <User size={18} color={colors.primary} />
            )}

            {/* Email */}
            {renderInfoField(
              'Email',
              'email', // Cognito key
              draftAttributes?.email || '',
              <Mail size={18} color={colors.primary} />,
              'email-address'
            )}

            {/* Phone Number */}
            {renderInfoField(
              'Phone',
              'phone_number', // Cognito key
              draftAttributes?.phone_number || '',
              <Phone size={18} color={colors.primary} />,
              'phone'
            )}

          </Card>

          <Modal
            visible={verificationState.showModal}
            transparent
            animationType="fade"
            onRequestClose={() => setVerificationState({ showModal: false, code: '' })}
          >
            <View style={styles.modalContainer} /* 👈 ADDED STYLE */>
              <View style={styles.modalView} /* 👈 ADDED STYLE */>
                <Text style={styles.modalTitle}>Enter Verification Code</Text>
                <TextInput
                  placeholder="Verification Code"
                  value={verificationState.code}
                  onChangeText={(text) => setVerificationState(prev => ({ ...prev, code: text }))}
                  keyboardType="numeric"

                />
                <View >
                  <TouchableOpacity
                    onPress={() => setVerificationState({ showModal: false, code: '' })}
                  >
                    <Text >Cancel</Text>
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
                    <Text >Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* *** Conditional Edit/Save/Cancel Buttons *** */}
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
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)} // Enter edit mode
            >
              <Text style={styles.modalButtonConfirmText}>Edit Information</Text>
            </TouchableOpacity>
          )}
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
          onPress={handleLogout}
          variant="secondary"
          style={styles.logoutButton}
        />
      </ScrollView >
    </View >
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
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent black overlay
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white', // Ensure modal content is visible
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
    width: '80%', // Make it a good size
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
    color: colors.text, // Make sure the text color is visible
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