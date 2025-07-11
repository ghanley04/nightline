import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Camera, School, Upload } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import Input from '@/components/Input';
import Button from '@/components/Button';
import colors from '@/constants/colors';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, setUser, setIsOnboarded } = useAuthStore();
  
  const [photo, setPhoto] = useState<string | null>(null);
  const [schoolAffiliation, setSchoolAffiliation] = useState('University of Missouri');
  const [userType, setUserType] = useState<'individual' | 'greek'>('individual');
  const [isLoading, setIsLoading] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your camera to take a profile picture.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleComplete = () => {
    if (!photo) {
      Alert.alert('Photo Required', 'Please upload a profile photo to continue.');
      return;
    }

    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      if (user) {
        // Update user with onboarding info
        setUser({
          ...user,
          photoUrl: photo,
          schoolAffiliation,
          userType,
        });
      }
      
      setIsOnboarded(true);
      router.replace('/subscription/plans');
      
      setIsLoading(false);
    }, 1000);
  };

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>We need a few more details to get you started</Text>
      </View>
      
      <View style={styles.photoSection}>
        <Text style={styles.sectionTitle}>Profile Photo</Text>
        <Text style={styles.photoNote}>
          Please upload a clear facial photo. This will be used for identification when boarding.
        </Text>
        
        <View style={styles.photoContainer}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Upload size={40} color={colors.textLight} />
            </View>
          )}
        </View>
        
        <View style={styles.photoButtons}>
          <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
            <Camera size={20} color={colors.primary} />
            <Text style={styles.photoButtonText}>Take Photo</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
            <Upload size={20} color={colors.primary} />
            <Text style={styles.photoButtonText}>Upload Photo</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.schoolSection}>
        <Text style={styles.sectionTitle}>School Information</Text>
        
        <Input
          label="School Affiliation"
          value={schoolAffiliation}
          onChangeText={setSchoolAffiliation}
          placeholder="Enter your school"
        />
      </View>
      
      <View style={styles.typeSection}>
        <Text style={styles.sectionTitle}>Rider Type</Text>
        <Text style={styles.typeNote}>
          Select your rider type. This will determine your subscription options.
        </Text>
        
        <View style={styles.typeButtons}>
          <TouchableOpacity 
            style={[
              styles.typeButton,
              userType === 'individual' && styles.selectedTypeButton
            ]}
            onPress={() => setUserType('individual')}
          >
            <Text 
              style={[
                styles.typeButtonText,
                userType === 'individual' && styles.selectedTypeButtonText
              ]}
            >
              Individual Student
            </Text>
            <Text style={styles.typePriceText}>$32.99/month</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.typeButton,
              userType === 'greek' && styles.selectedTypeButton
            ]}
            onPress={() => setUserType('greek')}
          >
            <Text 
              style={[
                styles.typeButtonText,
                userType === 'greek' && styles.selectedTypeButtonText
              ]}
            >
              Greek Life Member
            </Text>
            <Text style={styles.typePriceText}>$26.99/month</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <Button
        title="Continue to Subscription"
        onPress={handleComplete}
        loading={isLoading}
        style={styles.continueButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  photoSection: {
    marginBottom: 32,
  },
  photoNote: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 16,
  },
  photoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  photo: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  photoPlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  photoButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flex: 0.48,
    justifyContent: 'center',
  },
  photoButtonText: {
    marginLeft: 8,
    color: colors.primary,
    fontWeight: '500',
  },
  schoolSection: {
    marginBottom: 32,
  },
  typeSection: {
    marginBottom: 32,
  },
  typeNote: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 16,
  },
  typeButtons: {
    gap: 12,
  },
  typeButton: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedTypeButton: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10', // 10% opacity
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  selectedTypeButtonText: {
    color: colors.text,
  },
  typePriceText: {
    fontSize: 14,
    color: colors.textLight,
  },
  continueButton: {
    marginTop: 16,
  },
});