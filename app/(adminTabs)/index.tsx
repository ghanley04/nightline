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
    groupId: 'greek-membership',
    maxSubscribers: '10',
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [planType, setPlanType] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const user = await getCurrentUser();
        setCurrentUserId(user.userId);
      } catch (err) {
        Alert.alert('Error', 'Failed to load user information');
      }
    }
    loadUser();
  }, []);

  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validatePhone = (phone: string) => {
    if (!phone) return true;
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 10 || cleaned.length === 11;
  };

  const isGroupOrGreek = () => {
    const id = formData.groupId.toLowerCase();
    return id.includes('group') || id.includes('greek');
  };

  const handleMembershipTypeChange = (newGroupId: string) => {
    let defaultMax = '1';
    if (newGroupId === 'group-membership') defaultMax = '5';
    else if (newGroupId === 'greek-membership') defaultMax = '10';
    setFormData({ ...formData, groupId: newGroupId, maxSubscribers: defaultMax });
  };

  const handleSubmit = async () => {
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
    try {
      let formattedPhone = null;
      if (formData.phoneNumber) {
        const cleaned = formData.phoneNumber.replace(/\D/g, '');
        formattedPhone = cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`;
      }

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

      const httpResponse = await response.response;
      const data = await httpResponse.body.json() as {
        success: boolean;
        inviteLink?: string;
        inviteCode?: string;
        planType?: string;
        error?: string;
        message?: string;
      };

      if (data.success) {
        setInviteLink(data.inviteLink || null);
        setInviteCode(data.inviteCode || null);
        setPlanType(data.planType || null);

        if (data.inviteLink) {
          Alert.alert(
            'Success!',
            `${data.planType === 'greek' ? 'Greek' : 'Group'} membership created for ${formData.firstName} ${formData.lastName}!\n\nShare the invite link with up to ${formData.maxSubscribers} members.`,
            [{ text: 'OK' }]
          );
        } else {
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
      Alert.alert('Error', error.message || 'Failed to create membership. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (inviteLink) {
      await Clipboard.setStringAsync(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareLink = async () => {
    if (inviteLink) {
      try {
        await Share.share({
          message: `You've been invited to join Nightline ${planType === 'greek' ? 'Greek' : 'Group'} Membership! Share this link with your ${planType === 'greek' ? 'chapter' : 'group'} members (up to ${formData.maxSubscribers} people): ${inviteLink}`,
        });
      } catch (error) {
        console.error('Share error:', error);
      }
    }
  };

  const resetForm = () => {
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

  const PLAN_TYPES = [
    { id: 'individual-membership', label: 'Individual' },
    { id: 'group-membership',      label: 'Group' },
    { id: 'greek-membership',      label: 'Greek' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Add Membership</Text>
        <Text style={styles.subtitle}>Create a membership and generate invite links for groups</Text>

        {!inviteLink ? (
          <View style={styles.form}>

            {/* Name row */}
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>First Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.firstName}
                  onChangeText={(text) => setFormData({ ...formData, firstName: text })}
                  placeholder="First name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Last Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.lastName}
                  onChangeText={(text) => setFormData({ ...formData, lastName: text })}
                  placeholder="Last name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text.toLowerCase() })}
                placeholder="email@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput
                style={styles.input}
                value={formData.phoneNumber}
                onChangeText={(text) => setFormData({ ...formData, phoneNumber: text })}
                placeholder="+1 (555) 123-4567"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            {/* Membership Type */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Membership Type *</Text>
              <View style={styles.planTypeContainer}>
                {PLAN_TYPES.map(({ id, label }) => {
                  const active = formData.groupId === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[styles.planButton, active && styles.planButtonActive]}
                      onPress={() => handleMembershipTypeChange(id)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.planButtonText, active && styles.planButtonTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Max Subscribers */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {isGroupOrGreek() ? 'Number of Subscribers *' : 'Max Subscribers'}
              </Text>
              <TextInput
                style={[styles.input, !isGroupOrGreek() && styles.inputDisabled]}
                value={formData.maxSubscribers}
                onChangeText={(text) => setFormData({ ...formData, maxSubscribers: text.replace(/[^0-9]/g, '') })}
                placeholder="Enter number (1-100)"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                editable={isGroupOrGreek()}
              />
              <Text style={styles.helperText}>
                {isGroupOrGreek()
                  ? 'Total members who can use the invite link (1-100)'
                  : 'Individual plans support 1 subscriber'}
              </Text>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#0A0A0F" />
              ) : (
                <Text style={styles.submitButtonText}>Create Membership</Text>
              )}
            </TouchableOpacity>
          </View>

        ) : (
          <View style={styles.successContainer}>
            <View style={styles.checkmarkContainer}>
              <Check size={36} color="#0A0A0F" strokeWidth={3} />
            </View>

            <Text style={styles.successTitle}>Membership Created</Text>
            <Text style={styles.successSubtitle}>
              {formData.firstName} {formData.lastName}
            </Text>

            {inviteLink && (
              <>
                <View style={styles.infoCard}>
                  <Users size={20} color={colors.primary} />
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>Invite Link</Text>
                    <Text style={styles.infoValue}>
                      Up to {formData.maxSubscribers} members can join
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
                    activeOpacity={0.8}
                  >
                    {copied
                      ? <Check size={18} color={colors.success} />
                      : <Copy size={18} color={colors.text} />}
                    <Text style={[styles.actionButtonText, copied && { color: colors.success }]}>
                      {copied ? 'Copied!' : 'Copy Link'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleShareLink}
                    activeOpacity={0.8}
                  >
                    <Share2 size={18} color={colors.text} />
                    <Text style={styles.actionButtonText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity style={styles.newMemberButton} onPress={resetForm}>
              <Text style={styles.newMemberButtonText}>+ Add Another Member</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 28,
    lineHeight: 20,
  },
  form: {
    gap: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  optional: {
    fontWeight: '400',
    color: colors.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputDisabled: {
    opacity: 0.4,
  },
  helperText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },

  // Plan type selector
  planTypeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  planButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  planButtonActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  planButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  planButtonTextActive: {
    color: colors.primary,
  },

  // Submit
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.shadowGold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0F',
    letterSpacing: 0.3,
  },

  // Success state
  successContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  checkmarkContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: colors.shadowGold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 6,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.3,
  },
  successSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 14,
    borderRadius: 12,
    width: '100%',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  linkContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    borderRadius: 12,
    width: '100%',
  },
  linkText: {
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionButtonSuccess: {
    backgroundColor: colors.successDim,
    borderColor: colors.success,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  newMemberButton: {
    paddingVertical: 12,
    marginTop: 4,
  },
  newMemberButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
});