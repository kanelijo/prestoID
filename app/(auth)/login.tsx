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
  scopes: [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.file',
  ],
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

  // ─── SAFE BACK BUTTON ────────────────────────────────────
  const handleBackPress = () => {
    if (confirm) {
      setConfirm(null);
      setCode('');
      setResendTimer(30);
      setCanResend(false);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/onboarding' as any);
    }
  };

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
      data = signUpResult.data as any;
      error = signUpResult.error;
    }

    if (error) throw error;
    if (data?.user && data?.session) {
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
        console.error('Google Sign-In Error:', err);
        Alert.alert('Sign-In Error', err.message || 'Google authentication failed.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // ─── UNIFIED AUTH PROCESSOR ──────────────────────────────
  const processAuth = async (user: any, session: any, phoneIdentifier?: string) => {
    try {
      setUser(user);
      setSession(session);
      setVerified(true);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      const userRole = profile?.role || role;
      let userBizId = profile?.business_id;
      setRole(userRole);

      await AsyncStorage.setItem('zenza_role', userRole);

      if (userRole === 'admin') {
        const profileCache = {
          userId: user.id,
          email: user.email,
          phone: phoneIdentifier || user.phone,
          role: 'admin',
          businessId: userBizId || null,
          claimed: true,
        };
        await AsyncStorage.setItem('@user_profile', JSON.stringify(profileCache));

        if (!userBizId) {
          router.replace('/(auth)/create-institute' as any);
        } else {
          router.replace('/(admin)' as any);
        }
      } else {
        const { data: linkedStudent } = await supabase
          .from('students')
          .select('id, business_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (linkedStudent) {
          userBizId = linkedStudent.business_id;
          if (!profile?.claimed) {
            await supabase.from('profiles').update({ claimed: true, business_id: userBizId }).eq('id', user.id);
          }
          const profileCache = {
            userId: user.id,
            email: user.email,
            phone: phoneIdentifier || user.phone,
            role: 'student',
            businessId: userBizId || null,
            claimed: true,
          };
          await AsyncStorage.setItem('@user_profile', JSON.stringify(profileCache));
          router.replace('/(student)/id-card' as any);
        } else {
          let phoneToMatch = phoneIdentifier || user.phone || user.user_metadata?.phone;
          if (phoneToMatch) {
            const raw10 = phoneToMatch.replace(/[^0-9]/g, '').slice(-10);
            const { data: matchedStudent } = await supabase
              .from('students')
              .select('id, business_id')
              .eq('phone', raw10)
              .is('user_id', null)
              .maybeSingle();

            if (matchedStudent) {
              await supabase
                .from('students')
                .update({ user_id: user.id })
                .eq('id', matchedStudent.id);

              await supabase
                .from('profiles')
                .update({ business_id: matchedStudent.business_id, claimed: true })
                .eq('id', user.id);

              const profileCache = {
                userId: user.id,
                email: user.email,
                phone: phoneIdentifier || user.phone,
                role: 'student',
                businessId: matchedStudent.business_id,
                claimed: true,
              };
              await AsyncStorage.setItem('@user_profile', JSON.stringify(profileCache));
              router.replace('/(student)/id-card' as any);
              return;
            }
          }

          const profileCache = {
            userId: user.id,
            email: user.email,
            phone: phoneIdentifier || user.phone,
            role: 'student',
            businessId: null,
            claimed: false,
          };
          await AsyncStorage.setItem('@user_profile', JSON.stringify(profileCache));
          router.replace('/(auth)/claim-profile' as any);
        }
      }
    } catch (e: any) {
      console.error('Auth processing error:', e);
      router.replace('/(auth)/claim-profile' as any);
    }
  };

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
          onPress={handleBackPress}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.content}>
          {/* Header Branding */}
          <View style={styles.brandingSection}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoLetter}>Z</Text>
            </View>
            <Text style={styles.brandName}>Zenza</Text>
            <Text style={styles.brandTagline}>
              {role === 'admin' ? 'Institute Administration Portal' : 'Student & Learning Portal'}
            </Text>
          </View>

          {/* Auth Card */}
          <View style={styles.authCard}>
            <Text style={styles.cardTitle}>
              {!confirm ? 'Sign in with Phone' : 'Enter Verification Code'}
            </Text>
            <Text style={styles.cardSubtitle}>
              {!confirm
                ? 'We will send a 6-digit OTP to verify your phone number'
                : `Enter the code sent to +91 ${phoneNumber}`}
            </Text>

            {!confirm ? (
              <>
                {/* Phone Input Box */}
                <View style={styles.phoneInputContainer}>
                  <View style={styles.countryCodeBadge}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="Enter phone number"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    maxLength={10}
                  />
                </View>

                {/* Send OTP Action */}
                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  activeOpacity={0.85}
                  onPress={handleSendOTP}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send OTP</Text>
                  )}
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or continue with</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Google Sign In */}
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
                      <Ionicons name="logo-google" size={18} color="#AF2800" style={{ marginRight: 10 }} />
                      <Text style={styles.googleButtonText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* OTP Box */}
                <View style={styles.otpInputContainer}>
                  <TextInput
                    style={styles.otpInput}
                    placeholder="• • • • • •"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="number-pad"
                    value={code}
                    onChangeText={setCode}
                    maxLength={6}
                    autoFocus
                  />
                </View>

                {/* Verify Action */}
                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  activeOpacity={0.85}
                  onPress={handleVerifyOTP}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verify & Continue</Text>
                  )}
                </TouchableOpacity>

                {/* Resend Timer */}
                <View style={styles.resendRow}>
                  {canResend ? (
                    <TouchableOpacity onPress={handleResendOTP} disabled={isLoading}>
                      <Text style={styles.resendActiveText}>
                        <Ionicons name="refresh-outline" size={14} color="#AF2800" /> Resend OTP
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.resendCountdownText}>
                      <Ionicons name="time-outline" size={13} color="#64748B" /> Resend OTP in 0:{resendTimer < 10 ? `0${resendTimer}` : resendTimer}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.editNumberBtn}
                  onPress={() => { setConfirm(null); setCode(''); }}
                >
                  <Text style={styles.editNumberText}>Change phone number</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Footer */}
          <Text style={styles.footerNote}>
            By continuing, you agree to Zenza's Terms & Privacy Policy
          </Text>
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingTop: 60,
    paddingBottom: 30,
  },
  brandingSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  logoLetter: {
    fontSize: 40,
    fontWeight: '900',
    color: '#AF2800',
  },
  brandName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  brandTagline: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
    fontWeight: '500',
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    height: 52,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  countryCodeBadge: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
    marginRight: 10,
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: 1,
  },
  otpInputContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#AF2800',
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  otpInput: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 8,
    textAlign: 'center',
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#AF2800',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#AF2800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F6',
    borderWidth: 1.5,
    borderColor: '#FFD7CC',
    borderRadius: 14,
    height: 48,
  },
  googleButtonText: {
    color: '#AF2800',
    fontSize: 15,
    fontWeight: '700',
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
  editNumberBtn: {
    alignItems: 'center',
    marginTop: 12,
  },
  editNumberText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footerNote: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginTop: 20,
    fontWeight: '500',
  },
});
