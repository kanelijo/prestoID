import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

const { height: screenHeight } = Dimensions.get('window');

GoogleSignin.configure({
  webClientId: '500087439972-42l1848gjo7lm7du488ui5f44fluup5m.apps.googleusercontent.com',
  offlineAccess: true,
});

export default function LoginScreen() {
  const router = useRouter();
  const { role: paramRole } = useLocalSearchParams<{ role?: 'student' | 'admin' }>();
  const role = paramRole || 'student';
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Phone Auth States
  const [phoneNumber, setPhoneNumber] = useState('');
  const [confirm, setConfirm] = useState<any>(null);
  const [code, setCode] = useState('');

  const { setUser, setSession, setRole, setVerified } = useAuthStore();

  // ─── PHONE OTP ───────────────────────────────────────────

  const handleSendOTP = async () => {
    const cleaned = phoneNumber.replace(/\s/g, '');
    if (!cleaned || cleaned.length < 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit phone number.');
      return;
    }
    setIsLoading(true);
    try {
      const formatted = cleaned.startsWith('+') ? cleaned : `+91${cleaned}`;
      const confirmation = await auth().signInWithPhoneNumber(formatted);
      setConfirm(confirmation);
    } catch (err: any) {
      console.error('OTP Send Error:', err);
      Alert.alert('Error', err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!code || code.length < 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit OTP.');
      return;
    }
    setIsLoading(true);
    try {
      const userCredential = await confirm.confirm(code);
      const firebaseUser = userCredential.user;
      if (firebaseUser.phoneNumber) {
        await loginToSupabaseWithPhone(firebaseUser.phoneNumber);
      } else {
        throw new Error('Phone number missing from Firebase verification.');
      }
    } catch (err: any) {
      console.error('OTP Verify Error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        Alert.alert('Wrong Code', 'The OTP you entered is incorrect. Please try again.');
      } else {
        Alert.alert('Verification Failed', err.message || 'Invalid OTP code.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loginToSupabaseWithPhone = async (phone: string) => {
    const safePhone = phone.replace(/\+/g, '');
    const dummyEmail = `${safePhone}@zenza.app`;
    const dummyPassword = `${safePhone}ZenzaSecure2026!`;

    // Try sign in first
    let { data, error } = await supabase.auth.signInWithPassword({
      email: dummyEmail,
      password: dummyPassword,
    });

    // If user doesn't exist, create account
    if (error && error.message.includes('Invalid login credentials')) {
      const signUpResult = await supabase.auth.signUp({
        email: dummyEmail,
        password: dummyPassword,
        options: { data: { phone } },
      });
      data = signUpResult.data;
      error = signUpResult.error;
    }

    if (error) throw error;
    if (data.user && data.session) {
      await processAuth(data.user, data.session);
    }
  };

  // ─── GOOGLE SIGN-IN ──────────────────────────────────────

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      try { await GoogleSignin.signOut(); } catch (e) { /* ignore */ }

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
      setIsGoogleLoading(false);
    }
  };

  // ─── SHARED AUTH PROCESSING ──────────────────────────────

  const processAuth = async (user: any, session: any) => {
    const store = useAuthStore.getState();
    store.setUser(user);
    store.setSession(session);

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, business_id, claimed, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    let userRole = profile?.role;

    if (!userRole) {
      const { error: roleUpdateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          name: role === 'student' ? 'Student' : (user.user_metadata?.name || 'Admin'),
          email: user.email,
          role: role,
          business_id: profile?.business_id || null,
          claimed: profile?.claimed || false,
        });

      if (roleUpdateError) throw roleUpdateError;
      userRole = role;
    } else if (userRole !== role) {
      throw new Error(`This account is already registered as a ${userRole}. You cannot sign in as an ${role}.`);
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
        .maybeSingle();

      if (business) {
        store.setBusiness(business.id, business.organization_id, business.business_name, business.business_type);
        businessData = business;
      }
    }

    // Cache the profile details
    try {
      const profileCache = {
        userId: user.id,
        email: user.email,
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
      console.warn('Failed to save profile cache on login:', cacheErr);
    }

    let destination = '';
    if (userRole === 'admin') {
      const { data: inst, error: instError } = await supabase
        .from('businesses')
        .select('id')
        .eq('admin_id', user.id)
        .maybeSingle();

      if (!instError && inst) {
        destination = '/(admin)/students';
      } else {
        destination = '/(auth)/create-institute';
      }
    } else {
      if (profile?.claimed) {
        destination = '/(student)/id-card';
      } else {
        destination = '/(auth)/claim-profile';
      }
    }

    router.replace({
      pathname: '/restore',
      params: { next: destination },
    });
  };

  // ─── UI ──────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#AF2800', '#5C1400']}
        style={styles.container}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (confirm) {
              setConfirm(null);
              setCode('');
            } else if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/onboarding');
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.content}>
          {/* Branding */}
          <View style={styles.brandingSection}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoLetter}>Z</Text>
            </View>
            <Text style={styles.brandName}>Zenza</Text>
            <Text style={styles.brandTagline}>Smart Learning Companion</Text>
          </View>

          {/* Auth Card */}
          <View style={styles.authCard}>
            <Text style={styles.heading}>
              {role === 'admin' ? 'Admin Access' : 'Student Access'}
            </Text>
            <Text style={styles.subheading}>
              {confirm
                ? 'Enter the 6-digit code sent to your phone'
                : 'Enter your phone number to sign in securely'}
            </Text>

            {/* Phone / OTP Input */}
            {!confirm ? (
              <View style={styles.inputContainer}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.prefixText}>+91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="Phone Number"
                  placeholderTextColor="rgba(0,0,0,0.35)"
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  maxLength={10}
                  autoFocus
                />
              </View>
            ) : (
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.phoneInput, styles.otpInput]}
                  placeholder="● ● ● ● ● ●"
                  placeholderTextColor="rgba(0,0,0,0.25)"
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={setCode}
                  maxLength={6}
                  autoFocus
                />
              </View>
            )}

            {/* Primary Button: Send OTP / Verify */}
            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              activeOpacity={0.8}
              onPress={!confirm ? handleSendOTP : handleVerifyOTP}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons
                    name={!confirm ? 'phone-portrait-outline' : 'shield-checkmark-outline'}
                    size={20}
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.primaryButtonText}>
                    {!confirm ? 'Send OTP' : 'Verify & Continue'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Divider */}
            {!confirm && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Google Sign-In Button */}
                <TouchableOpacity
                  style={[styles.googleButton, isGoogleLoading && styles.buttonDisabled]}
                  activeOpacity={0.8}
                  onPress={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <ActivityIndicator color="#AF2800" />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={20} color="#AF2800" />
                      <Text style={styles.googleText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.footerText}>
              Secure authentication powered by Firebase & Supabase
            </Text>
          </View>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingTop: screenHeight * 0.12,
    paddingBottom: 40,
  },
  brandingSection: {
    alignItems: 'center',
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  logoLetter: {
    fontSize: 44,
    fontWeight: '900',
    color: '#AF2800',
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  brandTagline: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
    fontWeight: '500',
  },
  authCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    width: '100%',
    height: 56,
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  phonePrefix: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EEEEEE',
    borderRightWidth: 1,
    borderRightColor: '#E0E0E0',
  },
  prefixText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 17,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  otpInput: {
    textAlign: 'center',
    fontSize: 22,
    letterSpacing: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#AF2800',
    borderRadius: 16,
    height: 56,
    width: '100%',
    shadowColor: '#AF2800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: Colors.text.tertiary,
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F6',
    borderWidth: 1.5,
    borderColor: '#AF2800',
    borderRadius: 16,
    height: 52,
    width: '100%',
    gap: 10,
  },
  googleText: {
    color: '#AF2800',
    fontSize: 15,
    fontWeight: '700',
  },
  footerText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 18,
    fontWeight: '500',
  },
});
