import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, Link, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Colors, Gradients } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

GoogleSignin.configure({
  webClientId: '1025675193948-mqvpd8ibggabdk1kgar0bub55vkhbkur.apps.googleusercontent.com',
  offlineAccess: true,
});

export default function LoginScreen() {
  const router = useRouter();
  const { role: paramRole } = useLocalSearchParams<{ role?: 'student' | 'admin' }>();
  const role = paramRole || 'student';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { setUser, setSession, setRole, setVerified } = useAuthStore();

  const handleLogin = async () => {
    const cleanedEmail = email.trim();
    if (!cleanedEmail || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    if (!cleanedEmail.toLowerCase().endsWith('@gmail.com')) {
      Alert.alert('Email Format', 'Please use a valid @gmail.com address');
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user, session }, error } = await supabase.auth.signInWithPassword({
        email: cleanedEmail,
        password,
      });

      if (error) throw error;

      if (user && session) {
        await processAuth(user, session);
      }
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

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

  const processAuth = async (user: any, session: any) => {
    const store = useAuthStore.getState();
    store.setUser(user);
    store.setSession(session);

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, business_id, claimed')
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

    // Load business details if linked
    if (profile?.business_id) {
      const { data: business } = await supabase
        .from('businesses')
        .select('id, organization_id, business_name, business_type')
        .eq('id', profile.business_id)
        .single();

      if (business) {
        store.setBusiness(business.id, business.organization_id, business.business_name, business.business_type);
      }
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

  const handleForgotPassword = async () => {
    const cleanedEmail = email.trim();
    if (!cleanedEmail) {
      Alert.alert('Email Required', 'Please enter your email address first');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      const redirectUrl = Linking.createURL('reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(cleanedEmail, {
        redirectTo: redirectUrl,
      });
      if (error) throw error;
      Alert.alert('Reset Email Sent', `A password reset link has been sent to ${cleanedEmail}.`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
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
          {role === 'admin' ? 'Admin Sign In' : 'Student Sign In'}
        </Text>
        <Text style={styles.subheading}>
          {role === 'admin' ? 'Access your coaching dashboard' : 'Sign in to access your digital ID'}
        </Text>

        {/* Form */}
        <View style={styles.form}>
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

          {/* Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter password"
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

          {/* Forgot Password */}
          <TouchableOpacity style={styles.forgotButton} onPress={handleForgotPassword}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Sign In Button */}
          <TouchableOpacity
            onPress={handleLogin}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <LinearGradient
              colors={Gradients.primary as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.signInButton, isLoading && styles.buttonDisabled]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.signInButtonText}>Sign In</Text>
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
            <Text style={styles.googleText}>Sign in with Google</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Link */}
        <View style={styles.bottomLink}>
          <Text style={styles.bottomText}>Don't have an account? </Text>
          <Link href={{ pathname: '/(auth)/signup', params: { role } }} asChild>
            <TouchableOpacity style={{ paddingVertical: 4 }}>
              <Text style={styles.linkText}>Sign Up</Text>
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
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  brandingSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  logoLetter: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  brandName: {
    fontSize: 22,
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
    marginBottom: 28,
    fontWeight: '500',
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    gap: 8,
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
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -4,
  },
  forgotText: {
    color: Colors.accent.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  signInButton: {
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
  signInButtonText: {
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
