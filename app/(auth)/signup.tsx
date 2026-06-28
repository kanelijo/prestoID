import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Link, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Colors, Gradients } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

GoogleSignin.configure({
  webClientId: '698075781767-7me6ngm7q5je5lod3ktc5vjk15er19q0.apps.googleusercontent.com',
  offlineAccess: true,
});

export default function SignupScreen() {
  const router = useRouter();
  const { role: paramRole } = useLocalSearchParams<{ role?: 'student' | 'admin' }>();
  const role = paramRole || 'student';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { setUser, setSession, setRole, setVerified } = useAuthStore();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken || (userInfo as any).idToken;

      if (!idToken) {
        throw new Error('No ID token returned from Google.');
      }

      const { data: { user, session }, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) throw error;

      if (user && session) {
        await processAuth(user, session);
      }
    } catch (err: any) {
      if (err.code !== '12501' && err.message !== 'Sign in action cancelled') {
        Alert.alert('Google Sign-In Failed', err.message || 'Failed to authenticate with Google.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    const cleanedEmail = email.trim();
    const cleanedPhone = phone.trim();

    if (!fullName.trim() || !cleanedEmail || !cleanedPhone || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    // Phone validation (exactly 10 digits for India)
    if (cleanedPhone.length !== 10 || isNaN(Number(cleanedPhone))) {
      Alert.alert('Invalid Phone', 'Phone number must be exactly 10 digits');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }
    if (!cleanedEmail.toLowerCase().endsWith('@gmail.com')) {
      Alert.alert('Email Format', 'Email must be a valid @gmail.com address');
      return;
    }

    // Password strength check (at least 6 characters, must contain letters and numbers)
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters');
      return;
    }
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      Alert.alert('Weak Password', 'Password must contain both letters and numbers');
      return;
    }

    // Confirm password check
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user, session }, error } = await supabase.auth.signUp({
        email: cleanedEmail,
        password,
        options: {
          data: {
            name: fullName.trim(),
            phone: cleanedPhone,
            role: role,
          },
        },
      });

      if (error) throw error;

      if (user && session) {
        await processAuth(user, session);
      }
    } catch (error: any) {
      Alert.alert('Signup Failed', error.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const processAuth = async (user: any, session: any) => {
    const store = useAuthStore.getState();
    store.setUser(user);
    store.setSession(session);

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, business_id, claimed, avatar_url')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    let userRole = profile?.role;

    // If they used Google Sign-In, the trigger might have defaulted them to 'student'.
    // If they selected 'admin' in the UI and haven't claimed/linked anything yet, override it.
    if (!userRole || (userRole !== role && !profile?.business_id && !profile?.claimed)) {
      const { error: roleUpdateError } = await supabase
        .from('profiles')
        .update({ role: role })
        .eq('id', user.id);
      
      if (roleUpdateError) throw roleUpdateError;
      userRole = role;
    }

    store.setRole(userRole);
    const avatarUrl = profile?.avatar_url || null;
    store.setAvatarUrl(avatarUrl);

    // Load business details if linked
    let businessData = null;
    if (profile?.business_id) {
      const { data: business } = await supabase
        .from('businesses')
        .select('id, organization_id, business_name, business_type')
        .eq('id', profile.business_id)
        .single();

      if (business) {
        store.setBusiness(business.id, business.organization_id, business.business_name, business.business_type);
        businessData = business;
      }
    }

    // Cache the profile details
    try {
      const profileCache = {
        role: userRole,
        businessId: businessData?.id || null,
        businessCode: businessData?.organization_id || null,
        businessName: businessData?.business_name || null,
        businessType: businessData?.business_type || null,
        claimed: profile?.claimed || false,
        avatarUrl,
      };
      await AsyncStorage.setItem('@user_profile', JSON.stringify(profileCache));
    } catch (cacheErr) {
      console.warn('Failed to save profile cache on signup:', cacheErr);
    }

    if (userRole === 'admin') {
      // Check if admin has created their business profile
      const { data: inst, error: instError } = await supabase
        .from('businesses')
        .select('id')
        .eq('admin_id', user.id)
        .maybeSingle();

      if (!instError && inst) {
        router.replace('/(admin)/students');
      } else {
        router.replace('/(auth)/create-institute');
      }
    } else {
      // Student
      if (profile?.claimed) {
        router.replace('/(student)/id-card');
      } else {
        router.replace('/(auth)/claim-profile');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/onboarding');
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
        </TouchableOpacity>

        {/* Branding */}
        <View style={styles.brandingSection}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoLetter}>P</Text>
          </View>
          <Text style={styles.brandName}>PrestoID</Text>
        </View>

        {/* Heading */}
        <Text style={styles.heading}>
          {role === 'admin' ? 'Admin Registration' : 'Student Registration'}
        </Text>
        <Text style={styles.subheading}>
          {role === 'admin' ? 'Create your coaching center account' : 'Register to get your digital ID card'}
        </Text>


        {/* Form */}
        <View style={styles.form}>
          {/* Full Name */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor={Colors.text.tertiary}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.text.tertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Phone */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="phone-portrait-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="+91 98765 43210"
                placeholderTextColor={Colors.text.tertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Min. 6 characters"
                placeholderTextColor={Colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.text.tertiary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor={Colors.text.tertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.text.tertiary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Create Account Button */}
          <TouchableOpacity
            onPress={handleSignup}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <LinearGradient
              colors={Gradients.primary as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.createButton, isLoading && styles.buttonDisabled]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.createButtonText}>Create Account</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Button */}
          <TouchableOpacity 
            style={[styles.googleButton, isLoading && styles.buttonDisabled]} 
            activeOpacity={0.7}
            onPress={handleGoogleSignIn}
            disabled={isLoading}
          >
            <Ionicons name="logo-google" size={18} color="#4285F4" />
            <Text style={styles.googleText}>Sign up with Google</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Link */}
        <View style={styles.bottomLink}>
          <Text style={styles.bottomText}>Already have an account? </Text>
          <Link href={{ pathname: '/(auth)/login', params: { role } }} asChild>
            <TouchableOpacity style={{ paddingVertical: 4 }}>
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 40,
  },
  brandingSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  logoLetter: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: 0.5,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginBottom: 20,
    fontWeight: '500',
  },

  form: {
    gap: 16,
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 16,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  eyeButton: {
    padding: 4,
  },
  createButton: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: Colors.card.border,
  },
  dividerText: {
    color: Colors.text.tertiary,
    fontSize: 12,
    marginHorizontal: 16,
    fontWeight: '500',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingVertical: 14,
    gap: 8,
  },
  googleText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  bottomLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
  },
  bottomText: {
    color: Colors.text.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  linkText: {
    color: Colors.accent.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 20,
  },
});
