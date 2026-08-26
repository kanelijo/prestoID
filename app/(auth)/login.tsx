import { useState, useEffect } from 'react';
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
import { getAuth, signInWithPhoneNumber } from '@react-native-firebase/auth';
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
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);

  const { setUser, setSession, setRole, setVerified } = useAuthStore();

  // 30-Second Countdown Timer for OTP Resend
  useEffect(() => {
    let interval: any = null;
    if (confirm && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer(prev => {
          if (prev <= 1) {
            setCanResend(true);
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [confirm, resendTimer]);

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
      const auth = getAuth();
      const confirmation = await signInWithPhoneNumber(auth, formatted);
      setConfirm(confirmation);
      setResendTimer(30);
      setCanResend(false);
    } catch (err: any) {
      console.error('OTP Send Error:', err);
      Alert.alert('Verification Notice', err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!canResend || isLoading) return;
    await handleSendOTP();
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

    let { data, error } = await supabase.auth.signInWithPassword({
      email: dummyEmail,
      password: dummyPassword,
    });

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
      await supabase.from('profiles').upsert({
        id: data.user.id,
        phone: phone,
        role: role,
        name: role === 'admin' ? 'Admin' : 'Student',
      }, { onConflict: 'id' });

      await processAuth(data.user, data.session, phone);
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

  // ─── SHARED AUTH PROCESSING & DUAL LOGIN RESOLUTION ──────

  const processAuth = async (user: any, session: any, verifiedPhone?: string) => {
    const store = useAuthStore.getState();
    store.setUser(user);
    store.setSession(session);

    let profile: any = null;
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role, business_id, claimed, avatar_url, phone, email, full_name')
      .eq('id', user.id)
      .maybeSingle();

    profile = profileData;

    if (!profile && (user.email || verifiedPhone)) {
      let query = supabase.from('profiles').select('role, business_id, claimed, avatar_url, phone, email, full_name');
      if (user.email) query = query.eq('email', user.email);
      else if (verifiedPhone) query = query.eq('phone', verifiedPhone);
      const { data: linkedProfile } = await query.maybeSingle();
      if (linkedProfile) {
        profile = linkedProfile;
      }
    }

    let userRole = profile?.role;

    if (!userRole) {
      const { error: roleUpdateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          name: role === 'student' ? 'Student' : (user.user_metadata?.name || 'Admin'),
          full_name: role === 'student' ? 'Student' : (user.user_metadata?.name || 'Admin'),
          email: user.email,
          phone: verifiedPhone || profile?.phone || null,
          role: role,
          business_id: profile?.business_id || null,
          claimed: profile?.claimed || false,
        });

      if (roleUpdateError) throw roleUpdateError;
      userRole = role;
    } else if (userRole !== role) {
      throw new Error(`This account is registered as a ${userRole}. Please choose the ${userRole} tab to sign in.`);
    }

    store.setRole(userRole);
    const avatarUrl = profile?.avatar_url || null;
    store.setAvatarUrl(avatarUrl);

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

    try {
      const profileCache = {
        userId: user.id,
        email: user.email,
        phone: verifiedPhone || profile?.phone || null,
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
      const { data: inst } = await supabase
        .from('businesses')
        .select('id')
        .eq('admin_id', user.id)
        .maybeSingle();

      if (inst) {
        destination = '/(admin)/students';
      } else {
        destination = '/(auth)/create-institute';
      }
    } else {
      if (profile?.claimed && profile?.business_id) {
        destination = '/(student)/id-card';
      } else {
        destination = '/(auth)/claim-profile';
      }
    }

    setVerified(true);
    router.replace(`/restore?next=${encodeURIComponent(destination)}` as any);
  };

  // ─── UI ──────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <LinearGradient
        colors={['#AF2800', '#D34515', '#FF6F3D']}
        style={styles.container}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (confirm) {
              setConfirm(null);
              setCode('');
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.headerSection}>
            <Text style={styles.headerTitle}>
              {!confirm ? 'Verify your phone number' : 'Verifying your number'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {!confirm ? (
                <>Zenza will send an SMS message to verify your phone number. <Text style={styles.accentSubText}>Carrier rates may apply.</Text></>
              ) : (
                <>Waiting to automatically detect an SMS sent to <Text style={styles.boldPhone}>+91 {phoneNumber}</Text>.{' '}
                  <Text style={styles.wrongNumberLink} onPress={() => { setConfirm(null); setCode(''); }}>Wrong number?</Text>
                </>
              )}
            </Text>
          </View>

          <View style={styles.authCard}>
            {!confirm ? (
              <>
                <View style={styles.countryRow}>
                  <Text style={styles.countryText}>India</Text>
                  <Ionicons name="caret-down" size={12} color="#666" />
                </View>
                <View style={styles.countryDivider} />

                <View style={styles.phoneInputRow}>
                  <Text style={styles.phoneCodePrefix}>+91</Text>
                  <View style={styles.verticalInputDivider} />
                  <TextInput
                    style={styles.phoneInputField}
                    placeholder="phone number"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    maxLength={10}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[styles.actionButton, isLoading && styles.buttonDisabled]}
                  activeOpacity={0.85}
                  onPress={handleSendOTP}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.actionButtonText}>Next</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or continue with</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={[styles.googleButton, isGoogleLoading && styles.buttonDisabled]}
                  activeOpacity={0.85}
                  onPress={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <ActivityIndicator color="#AF2800" size="small" />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={18} color="#AF2800" style={{ marginRight: 8 }} />
                      <Text style={styles.googleButtonText}>Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.otpContainer}>
                  <TextInput
                    style={styles.otpInputField}
                    placeholder="- - -  - - -"
                    placeholderTextColor="#AAA"
                    keyboardType="number-pad"
                    value={code}
                    onChangeText={setCode}
                    maxLength={6}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[styles.actionButton, isLoading && styles.buttonDisabled]}
                  activeOpacity={0.85}
                  onPress={handleVerifyOTP}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.actionButtonText}>Verify & Continue</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.resendRow}>
                  {canResend ? (
                    <TouchableOpacity onPress={handleResendOTP} disabled={isLoading}>
                      <Text style={styles.resendActiveText}>
                        <Ionicons name="chatbox-ellipses-outline" size={14} color="#AF2800" /> Resend SMS
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.resendCountdownText}>
                      <Ionicons name="time-outline" size={13} color="#888" /> Resend SMS in {Math.floor(resendTimer / 60)}:{resendTimer % 60 < 10 ? '0' : ''}{resendTimer % 60}
                    </Text>
                  )}
                </View>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    lineHeight: 21,
  },
  accentSubText: {
    color: '#FFE57F',
    fontWeight: '600',
  },
  boldPhone: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  wrongNumberLink: {
    color: '#FFE57F',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  countryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },
  countryDivider: {
    height: 1.5,
    backgroundColor: '#00A884',
    marginBottom: 16,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 20,
  },
  phoneCodePrefix: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
  },
  verticalInputDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 12,
  },
  phoneInputField: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
    letterSpacing: 1.5,
  },
  actionButton: {
    backgroundColor: '#00A884',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00A884',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F6',
    borderWidth: 1.5,
    borderColor: '#AF2800',
    borderRadius: 14,
    height: 48,
    width: '100%',
  },
  googleButtonText: {
    color: '#AF2800',
    fontSize: 15,
    fontWeight: '700',
  },
  otpContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 20,
  },
  otpInputField: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 10,
    textAlign: 'center',
    width: '100%',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#00A884',
  },
  resendRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  resendCountdownText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  resendActiveText: {
    fontSize: 14,
    color: '#AF2800',
    fontWeight: '700',
  },
  footerText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 18,
    fontWeight: '500',
  },
});
