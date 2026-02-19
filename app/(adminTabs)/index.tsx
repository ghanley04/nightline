import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Copy, Share2, Users } from 'lucide-react-native';
import colors from '@/constants/colors';
import { post } from 'aws-amplify/api';
import { getCurrentUser } from 'aws-amplify/auth';
import * as Clipboard from 'expo-clipboard';


export default function ManualAddMembership() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    groupId: 'greek-membership', // Default to greek
    maxSubscribers: '10', // Default for greek/group plans
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [planType, setPlanType] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadUser() {
      console.log('👤 [LOAD_USER] Loading current user...');
      try {
        const user = await getCurrentUser();
        console.log('👤 [LOAD_USER] User obtained:', user.userId);
        setCurrentUserId(user.userId);
      } catch (err) {
        console.error('❌ [LOAD_USER] Error loading user:', err);
        Alert.alert('Error', 'Failed to load user information');
      }
    }
    loadUser();
  }, []);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validatePhone = (phone: string) => {
    if (!phone) return true; // Phone is optional
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 10 || cleaned.length === 11;
  };

  const isGroupOrGreek = () => {
    const id = formData.groupId.toLowerCase();
    return id.includes('group') || id.includes('greek');
  };

  // Update default maxSubscribers when membership type changes
  const handleMembershipTypeChange = (newGroupId: string) => {
    console.log('🔘 [TYPE_CHANGE] Changing membership type to:', newGroupId);

    // Set default maxSubscribers based on type
    let defaultMax = '1';
    if (newGroupId === 'group-membership') {
      defaultMax = '5';
    } else if (newGroupId === 'greek-membership') {
      defaultMax = '10';
    }

    setFormData({
      ...formData,
      groupId: newGroupId,
      maxSubscribers: defaultMax
    });
  };

  const handleSubmit = async () => {
    console.log('📝 [SUBMIT] ========== STARTING MANUAL ADD ==========');
    console.log('📝 [SUBMIT] Form data:', formData);

    // Validation
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      Alert.alert('Error', 'Please enter first and last name');
      return;
    }

    if (!validateEmail(formData.email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (formData.phoneNumber && !validatePhone(formData.phoneNumber)) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number');
      return;
    }

    if (!currentUserId) {
      Alert.alert('Error', 'User ID not loaded. Please try again.');
      return;
    }

    if (isGroupOrGreek()) {
      const maxSubs = parseInt(formData.maxSubscribers);
      if (!formData.maxSubscribers || maxSubs < 1 || maxSubs > 100) {
        Alert.alert('Error', 'Please enter a valid number of subscribers (1-100)');
        return;
      }
    }

    setLoading(true);
    console.log('📝 [SUBMIT] Setting loading to true');

    try {
      // Format phone number
      let formattedPhone = null;
      if (formData.phoneNumber) {
        const cleaned = formData.phoneNumber.replace(/\D/g, '');
        formattedPhone = cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`;
        console.log('📝 [SUBMIT] Formatted phone:', formattedPhone);
      }

      console.log('📝 [SUBMIT] Making POST request to /manualAddMembership...');
      const response = await post({
        apiName: 'apiNightline',
        path: '/manual-add-membership',
        options: {
          body: {
            userId: currentUserId,
            email: formData.email.toLowerCase(),
            firstName: formData.firstName,
            lastName: formData.lastName,
            phoneNumber: formattedPhone,
            groupId: formData.groupId,
            maxSubscribers: formData.maxSubscribers,
          },
        },
      });

      console.log('📝 [SUBMIT] POST request completed, getting response...');
      const httpResponse = await response.response;
      const { body } = httpResponse;

      // Parse the JSON response
      const data = await body.json() as {
        success: boolean;
        inviteLink?: string;
        inviteCode?: string;
        planType?: string;
        error?: string;
        message?: string;
      };

      console.log('📝 [SUBMIT] Response data:', data);

      if (data.success) {
        console.log('✅ [SUBMIT] Membership created successfully');
        setInviteLink(data.inviteLink || null);
        setInviteCode(data.inviteCode || null);
        setPlanType(data.planType || null);

        // Show different messages based on plan type
        if (data.inviteLink) {
          console.log('🔗 [SUBMIT] Invite link received:', data.inviteLink);
          Alert.alert(
            'Success!',
            `${data.planType === 'greek' ? 'Greek' : 'Group'} membership created for ${formData.firstName} ${formData.lastName}!\n\nShare the invite link with up to ${formData.maxSubscribers} members.`,
            [{ text: 'OK' }]
          );
        } else {
          console.log('ℹ️ [SUBMIT] No invite link (individual plan)');
          Alert.alert(
            'Success!',
            `Individual membership created for ${formData.firstName} ${formData.lastName}`,
            [{ text: 'OK' }]
          );
        }
      } else {
        throw new Error(data.error || 'Failed to create membership');
      }
    } catch (error: any) {
      console.error('❌ [SUBMIT] ========== ERROR IN MANUAL ADD ==========');
      console.error('❌ [SUBMIT] Error:', error);
      console.error('❌ [SUBMIT] Error message:', error.message);
      Alert.alert('Error', error.message || 'Failed to create membership. Please try again.');
    } finally {
      console.log('📝 [SUBMIT] Setting loading to false');
      setLoading(false);
      console.log('📝 [SUBMIT] ========== MANUAL ADD ENDED ==========');
    }
  };

  const handleCopyLink = async () => {
    if (inviteLink) {
      console.log('📋 [COPY] Copying invite link to clipboard');
      await Clipboard.setStringAsync(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      console.log('✅ [COPY] Link copied successfully');
    }
  };

  const handleShareLink = async () => {
    if (inviteLink) {
      console.log('📤 [SHARE] Sharing invite link');
      try {
        await Share.share({
          message: `You've been invited to join Nightline ${planType === 'greek' ? 'Greek' : 'Group'} Membership! Share this link with your ${planType === 'greek' ? 'chapter' : 'group'} members (up to ${formData.maxSubscribers} people): ${inviteLink}`,
        });
        console.log('✅ [SHARE] Share dialog opened');
      } catch (error) {
        console.error('❌ [SHARE] Error sharing:', error);
      }
    }
  };

  const resetForm = () => {
    console.log('🔄 [RESET] Resetting form');
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phoneNumber: '',
      groupId: 'greek-membership',
      maxSubscribers: '10',
    });
    setInviteLink(null);
    setInviteCode(null);
    setPlanType(null);
  };

  console.log('🎨 [RENDER] Rendering with loading:', loading, 'inviteLink:', !!inviteLink);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={[colors.secondary, '#222222']} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Manual Add Membership</Text>
          <Text style={styles.subtitle}>
            Create a membership and generate invite links for groups
          </Text>

          {!inviteLink ? (
            <View style={styles.form}>
              {/* First Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>First Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.firstName}
                  onChangeText={(text) => {
                    console.log('📝 [INPUT] First name changed:', text);
                    setFormData({ ...formData, firstName: text });
                  }}
                  placeholder="Enter first name"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                />
              </View>

              {/* Last Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Last Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.lastName}
                  onChangeText={(text) => {
                    console.log('📝 [INPUT] Last name changed:', text);
                    setFormData({ ...formData, lastName: text });
                  }}
                  placeholder="Enter last name"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                />
              </View>

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.email}
                  onChangeText={(text) => {
                    console.log('📝 [INPUT] Email changed:', text);
                    setFormData({ ...formData, email: text.toLowerCase() });
                  }}
                  placeholder="email@example.com"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Phone Number */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone Number (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.phoneNumber}
                  onChangeText={(text) => {
                    console.log('📝 [INPUT] Phone changed:', text);
                    setFormData({ ...formData, phoneNumber: text });
                  }}
                  placeholder="+1 (555) 123-4567"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Membership Type */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Membership Type *</Text>
                <View style={styles.planTypeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.planButton,
                      formData.groupId === 'individual-membership' && styles.planButtonActive,
                    ]}
                    onPress={() => handleMembershipTypeChange('individual-membership')}
                  >
                    <Text
                      style={[
                        styles.planButtonText,
                        formData.groupId === 'individual-membership' &&
                        styles.planButtonTextActive,
                      ]}
                    >
                      Individual
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.planButton,
                      formData.groupId === 'group-membership' && styles.planButtonActive,
                    ]}
                    onPress={() => handleMembershipTypeChange('group-membership')}
                  >
                    <Text
                      style={[
                        styles.planButtonText,
                        formData.groupId === 'group-membership' &&
                        styles.planButtonTextActive,
                      ]}
                    >
                      Group
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.planButton,
                      formData.groupId === 'greek-membership' && styles.planButtonActive,
                    ]}
                    onPress={() => handleMembershipTypeChange('greek-membership')}
                  >
                    <Text
                      style={[
                        styles.planButtonText,
                        formData.groupId === 'greek-membership' &&
                        styles.planButtonTextActive,
                      ]}
                    >
                      Greek
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Max Subscribers - Show for ALL types but make it editable */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  {isGroupOrGreek() ? 'Number of Subscribers *' : 'Max Subscribers'}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    !isGroupOrGreek() && styles.inputDisabled
                  ]}
                  value={formData.maxSubscribers}
                  onChangeText={(text) => {
                    console.log('📝 [INPUT] Max subscribers changed:', text);
                    setFormData({ ...formData, maxSubscribers: text.replace(/[^0-9]/g, '') });
                  }}
                  placeholder="Enter number (1-100)"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="number-pad"
                  editable={isGroupOrGreek()} // Only editable for group/greek
                />
                <Text style={styles.helperText}>
                  {isGroupOrGreek()
                    ? 'Total members who can use the invite link (1-100)'
                    : 'Individual plans support 1 subscriber'
                  }
                </Text>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Create Membership</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.successContainer}>
              <View style={styles.checkmarkContainer}>
                <Check size={48} color={colors.primary} />
              </View>

              <Text style={styles.successTitle}>Membership Created!</Text>
              <Text style={styles.successSubtitle}>
                {formData.firstName} {formData.lastName}
              </Text>

              {inviteLink && (
                <>
                  <View style={styles.infoCard}>
                    <Users size={24} color={colors.primary} />
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.infoLabel}>Invite Link</Text>
                      <Text style={styles.infoValue}>
                        Up to {formData.maxSubscribers} members can use this link
                      </Text>
                    </View>
                  </View>

                  <View style={styles.linkContainer}>
                    <Text style={styles.linkText} numberOfLines={2} ellipsizeMode="middle">
                      {inviteLink}
                    </Text>
                  </View>

                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.actionButton, copied && styles.actionButtonSuccess]}
                      onPress={handleCopyLink}
                    >
                      {copied ? (
                        <Check size={20} color="#fff" />
                      ) : (
                        <Copy size={20} color="#fff" />
                      )}
                      <Text style={styles.actionButtonText}>
                        {copied ? 'Copied!' : 'Copy Link'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton} onPress={handleShareLink}>
                      <Share2 size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <TouchableOpacity style={styles.newInviteButton} onPress={resetForm}>
                <Text style={styles.newInviteButtonText}>Add Another Member</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.placeholder,
    marginBottom: 32,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  inputDisabled: {
    opacity: 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  helperText: {
    fontSize: 12,
    color: colors.placeholder,
    marginTop: 4,
  },
  planTypeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  planButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  planButtonActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(138, 43, 226, 0.2)',
  },
  planButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.placeholder,
  },
  planButtonTextActive: {
    color: colors.primary,
  },
  submitButton: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  checkmarkContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(138, 43, 226, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: colors.placeholder,
    marginBottom: 32,
    textAlign: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.placeholder,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  linkContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 24,
  },
  linkText: {
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    borderRadius: 12,
  },
  actionButtonSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  newInviteButton: {
    padding: 16,
  },
  newInviteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});