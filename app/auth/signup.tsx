import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Mail, Lock, User, Phone } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { mockUser } from '@/mocks/userData';
import Input from '@/components/Input';
import Button from '@/components/Button';
import colors from '@/constants/colors';

// import { addUser } from '../../api';

export default function SignupScreen() {
  const router = useRouter();
  const { setUser, setToken, setIsAuthenticated, setIsOnboarded } = useAuthStore();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    password: '', 
    confirmPassword: '' 
  });
  const [isLoading, setIsLoading] = useState(false);

  const validateForm = () => {
    let isValid = true;
    const newErrors = { 
      name: '', 
      email: '', 
      phone: '', 
      password: '', 
      confirmPassword: '' 
    };

    if (!name) {
      newErrors.name = 'Name is required';
      isValid = false;
    }

    if (!email) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
      isValid = false;
    }

    if (!phone) {
      newErrors.phone = 'Phone number is required';
      isValid = false;
    } else if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
      isValid = false;
    }

    if (!password) {
      newErrors.password = 'Password is required';
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
      isValid = false;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // 1. Prepare the data to send to your backend
      const userDataToSend = {
        name,
        email,
        phone: phone.replace(/\D/g, ''), // Send only digits to the backend
        password,
        isSubscribed: false,
        // You can add other fields here if your profile expects them,
        // e.g., 'userRole': 'customer' or 'status': 'pending'
      };

      // 2. Call your addUser function (which uses Amplify's post)
      const backendResponse = await addUser(userDataToSend);

      // 3. Handle successful response from the backend
      // Assuming your backend returns user data and a token upon successful signup
      Alert.alert('Success', 'Account created successfully!');
      
      // Update your auth store with data from the backend response
      setUser(backendResponse.user); // Assuming backendResponse.user contains the user object
      setToken(backendResponse.token); // Assuming backendResponse.token contains the auth token
      setIsAuthenticated(true);
      setIsOnboarded(false); // Adjust based on your onboarding flow/backend response
      router.replace('/onboarding');

    } catch (error) {
      // 4. Handle errors from the backend or network issues
      console.error('Signup process failed:', error);
      Alert.alert('Signup Error', error.message || 'An unexpected error occurred during signup. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    router.push('/auth/login');
  };

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Sign up for Night Line shuttle service</Text>
      </View>
      
      <View style={styles.form}>
        <Input
          label="Full Name"
          placeholder="Enter your full name"
          value={name}
          onChangeText={setName}
          error={errors.name}
        />
        
        <Input
          label="Email"
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
        />
        
        <Input
          label="Phone Number"
          placeholder="Enter your phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          error={errors.phone}
        />
        
        <Input
          label="Password"
          placeholder="Create a password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={errors.password}
        />
        
        <Input
          label="Confirm Password"
          placeholder="Confirm your password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          error={errors.confirmPassword}
        />
        
        <Button
          title="Sign Up"
          onPress={handleSignUp}
          loading={isLoading}
          style={styles.signupButton}
        />
      </View>
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <TouchableOpacity onPress={handleLogin}>
          <Text style={styles.loginText}>Log In</Text>
        </TouchableOpacity>
      </View>
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
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
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
  form: {
    marginBottom: 24,
  },
  signupButton: {
    marginTop: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  footerText: {
    color: colors.textLight,
    marginRight: 4,
  },
  loginText: {
    color: colors.primary,
    fontWeight: '600',
  },
});