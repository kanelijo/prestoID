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
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { sendPushNotification, CHANNELS } from '@/lib/notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ClaimProfileScreen() {
  const router = useRouter();
  const { directMode } = useLocalSearchParams<{ directMode?: string }>();
  const { user, setRole, setBusiness } = useAuthStore();

  // Mode: 'select' (choose between coaching ID vs public test) | 'credentials' (enter coaching credentials)
  const [mode, setMode] = useState<'select' | 'credentials'>(
    directMode === 'credentials' ? 'credentials' : 'select'
  );

  const [businessCode, setBusinessCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [useAadhaar, setUseAadhaar] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublicLoading, setIsPublicLoading] = useState(false);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/login');
    }
  };

  // Handler for Public Test Student selection
  const handleStartPublicPractice = async () => {
    try {
      setIsPublicLoading(true);
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ is_external: true, claimed: true, role: 'student' })
          .eq('id', user.id);
      }

      useAuthStore.getState().setRole('student');
      useAuthStore.getState().setOnboarded(true);
      useAuthStore.getState().setActiveEnvironment('public');

      const profileCache = {
        role: 'student',
        businessId: null,
        claimed: true,
        is_external: true,
      };
      await AsyncStorage.setItem('@user_profile', JSON.stringify(profileCache));

      router.replace('/(student)/public-tests');
    } catch (e: any) {
      console.warn('Public practice start error:', e);
      router.replace('/(student)/public-tests');
    } finally {
      setIsPublicLoading(false);
    }
  };

  // Handler for Enrolled Coaching Student claiming credentials
  const handleClaim = async () => {
    const cleanedCode = businessCode.trim().toUpperCase();
    const cleanedPasscode = useAadhaar ? passcode.trim() : passcode.trim().toUpperCase();

    if (!cleanedCode || !cleanedPasscode) {
      Alert.alert('Missing Fields', 'Please enter both your Organization ID and Passcode.');
      return;
    }

    if (!user) {
      Alert.alert('Session Error', 'Please log in again.');
      router.replace('/(auth)/login');
      return;
    }

    setIsLoading(true);
    try {
      // Step 1: Find the business by organization_id
      const { data: business, error: bizError } = await supabase
        .from('businesses')
        .select('id, organization_id, business_name, business_type')
        .eq('organization_id', cleanedCode)
        .maybeSingle();

      if (bizError || !business) {
        throw new Error('Invalid Organization ID. Please check the code with your coaching institute.');
      }

      // Step 2: Query students table for matching passcode or aadhaar_number
      let studentRecord: any = null;

      if (useAadhaar) {
        const { data: studentsByAadhaar, error: aadhError } = await supabase
          .from('students')
          .select('id, name, roll_number, aadhaar_number, user_id')
          .eq('business_id', business.id)
          .like('aadhaar_number', `%${cleanedPasscode}`);

        if (aadhError || !studentsByAadhaar || studentsByAadhaar.length === 0) {
          throw new Error('No student found with these last 4 digits of Aadhaar.');
        }
        if (studentsByAadhaar.length > 1) {
          throw new Error('Multiple students matched. Please verify with your institute admin.');
        }
        studentRecord = studentsByAadhaar[0];
      } else {
        const { data: studentByPasscode, error: studentError } = await supabase
          .from('students')
          .select('id, name, roll_number, unique_passcode, user_id')
          .eq('business_id', business.id)
          .eq('unique_passcode', cleanedPasscode)
          .maybeSingle();

        if (studentError || !studentByPasscode) {
          throw new Error('Invalid Secret Passcode. Please verify with your coaching institute.');
        }
        studentRecord = studentByPasscode;
      }

      // Check if already claimed by someone else
      if (studentRecord.user_id && studentRecord.user_id !== user.id) {
        throw new Error('This student profile has already been claimed by another account.');
      }

      // Step 3: Link the student record to current user
      const { error: updateStudentError } = await supabase
        .from('students')
        .update({ user_id: user.id })
        .eq('id', studentRecord.id);

      if (updateStudentError) throw updateStudentError;

      // Update current user profile
      const { error: updateProfileError } = await supabase
        .from('profiles')
        .update({
          business_id: business.id,
          claimed: true,
          is_external: false,
          role: 'student',
        })
        .eq('id', user.id);

      if (updateProfileError) throw updateProfileError;

      // Step 3.5: Notify teacher
      try {
        const { data: bizAdmin } = await supabase
          .from('businesses')
          .select('admin_id')
          .eq('id', business.id)
          .maybeSingle();

        if (bizAdmin?.admin_id) {
          const { data: adminProf } = await supabase
            .from('profiles')
            .select('push_token')
            .eq('id', bizAdmin.admin_id)
            .maybeSingle();

          if (adminProf?.push_token) {
            await sendPushNotification(
              [adminProf.push_token],
              '🎉 New Student Linked',
              `${studentRecord.name} has claimed their profile and joined ${business.business_name}!`,
              { studentId: studentRecord.id, type: 'new_student' },
              undefined,
              CHANNELS.admin
            );
          }
        }
      } catch (pushErr) {
        console.warn('Failed to notify admin about new student:', pushErr);
      }

      // Step 4: Update store and navigate
      setRole('student');
      setBusiness(business.id, business.organization_id, business.business_name, business.business_type);

      const profileCache = {
        role: 'student',
        businessId: business.id,
        businessCode: business.organization_id,
        businessName: business.business_name,
        businessType: business.business_type,
        claimed: true,
        is_external: false,
        avatarUrl: null,
      };
      await AsyncStorage.setItem('@user_profile', JSON.stringify(profileCache));

      useAuthStore.getState().setOnboarded(true);
      useAuthStore.getState().setActiveEnvironment('enrolled');

      Alert.alert(
        'Welcome! 🎉',
        `Profile claimed successfully!\nYou are now linked to ${business.business_name}.`,
        [{ text: 'Continue', onPress: () => router.replace('/(student)/id-card') }]
      );
    } catch (err: any) {
      Alert.alert('Claim Failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        {mode === 'credentials' ? (
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setMode('select')}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
        )}

        <Text style={styles.headerBrandTitle}>Zenza</Text>

        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centerWrapper}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Centered Floating Card — Redesigned same as Login & Screenshot */}
          <View style={styles.centeredCard}>
            {mode === 'select' ? (
              // ─── STEP 1: CATEGORIZATION CHOICE ─────────────────────────────
              <>
                <View style={styles.cardIconCircle}>
                  <Ionicons name="school-outline" size={28} color="#AF2800" />
                </View>

                <Text style={styles.cardTitle}>Choose Student Mode</Text>
                <Text style={styles.cardSubtitle}>
                  Are you enrolled in a partner coaching institute, or practicing independently?
                </Text>

                {/* Option 1: Coaching Student */}
                <TouchableOpacity
                  style={styles.choiceCard}
                  activeOpacity={0.85}
                  onPress={() => setMode('credentials')}
                >
                  <View style={styles.choiceHeaderRow}>
                    <View style={[styles.choiceBadge, { backgroundColor: '#FFE2DB' }]}>
                      <Text style={[styles.choiceBadgeText, { color: '#AF2800' }]}>INSTITUTE ENROLLED</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={18} color="#AF2800" />
                  </View>

                  <View style={styles.choiceBodyRow}>
                    <View style={styles.choiceIconBox}>
                      <Ionicons name="business" size={24} color="#AF2800" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.choiceTitle}>I Have a Coaching ID</Text>
                      <Text style={styles.choiceDesc}>
                        Link your profile to unlock your Institute Digital ID Card, batch tests, and attendance.
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Option 2: Public Practice */}
                <TouchableOpacity
                  style={[styles.choiceCard, { borderColor: '#E0E7FF' }]}
                  activeOpacity={0.85}
                  onPress={handleStartPublicPractice}
                  disabled={isPublicLoading}
                >
                  <View style={styles.choiceHeaderRow}>
                    <View style={[styles.choiceBadge, { backgroundColor: '#EEF2FF' }]}>
                      <Text style={[styles.choiceBadgeText, { color: '#4F46E5' }]}>FREE & OPEN ACCESS</Text>
                    </View>
                    {isPublicLoading ? (
                      <ActivityIndicator size="small" color="#4F46E5" />
                    ) : (
                      <Ionicons name="arrow-forward" size={18} color="#4F46E5" />
                    )}
                  </View>

                  <View style={styles.choiceBodyRow}>
                    <View style={[styles.choiceIconBox, { backgroundColor: '#EEF2FF' }]}>
                      <Ionicons name="planet" size={24} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.choiceTitle}>Practice Public Tests</Text>
                      <Text style={styles.choiceDesc}>
                        Independent aspirant? Attempt All-India open mocks, view live leaderboards, and read exam feeds.
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              // ─── STEP 2: CREDENTIAL FILLING WINDOW (CENTERED) ───────────────
              <>
                <View style={styles.cardIconCircle}>
                  <Ionicons name="card-outline" size={28} color="#AF2800" />
                </View>

                <Text style={styles.cardTitle}>Claim Your ID Card</Text>
                <Text style={styles.cardSubtitle}>
                  Enter your verification passcode or Aadhaar number to link and activate your digital card.
                </Text>

                {/* Verification Method Segmented Selector */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputFieldLabel}>Verification Method</Text>
                  <View style={styles.segmentedToggleRow}>
                    <TouchableOpacity
                      style={[styles.segmentedTab, !useAadhaar && styles.segmentedTabActive]}
                      onPress={() => {
                        setUseAadhaar(false);
                        setPasscode('');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segmentedTabText, !useAadhaar && styles.segmentedTabTextActive]}>
                        Secret Code
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.segmentedTab, useAadhaar && styles.segmentedTabActive]}
                      onPress={() => {
                        setUseAadhaar(true);
                        setPasscode('');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segmentedTabText, useAadhaar && styles.segmentedTabTextActive]}>
                        Aadhaar Card
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Organization ID */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputFieldLabel}>Organization ID</Text>
                  <TextInput
                    style={styles.textInputField}
                    placeholder="e.g. INST-100"
                    placeholderTextColor="#9CA3AF"
                    value={businessCode}
                    onChangeText={setBusinessCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>

                {/* Secret Passcode or Aadhaar */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputFieldLabel}>
                    {useAadhaar ? 'Last 4 Digits of Aadhaar' : 'Secret Passcode'}
                  </Text>
                  <TextInput
                    style={styles.textInputField}
                    placeholder={useAadhaar ? 'e.g. 5678' : 'e.g. A3K9ZP'}
                    placeholderTextColor="#9CA3AF"
                    value={passcode}
                    onChangeText={setPasscode}
                    autoCapitalize={useAadhaar ? 'none' : 'characters'}
                    keyboardType={useAadhaar ? 'number-pad' : 'default'}
                    maxLength={useAadhaar ? 4 : 20}
                    secureTextEntry={useAadhaar}
                  />
                </View>

                {/* Primary Button: Get Virtual ID Card */}
                <TouchableOpacity
                  style={styles.primaryBtnWrap}
                  onPress={handleClaim}
                  activeOpacity={0.85}
                  disabled={isLoading}
                >
                  <LinearGradient
                    colors={['#AF2800', '#D9480F']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryBtnGradient}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Get Virtual ID Card</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Link to switch to public practice */}
                <TouchableOpacity
                  onPress={handleStartPublicPractice}
                  style={styles.secondaryLinkBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryLinkText}>
                    Don't have coaching credentials?{' '}
                    <Text style={{ fontWeight: '800', color: '#AF2800' }}>Practice Public Tests</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBrandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#AF2800',
    letterSpacing: 0.5,
  },

  centerWrapper: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },

  // Centered Floating Card
  centeredCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 440,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },

  cardIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFE2DB',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },

  // Method Segmented Row
  inputGroup: {
    marginBottom: 16,
    width: '100%',
  },
  inputFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  segmentedToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentedTabActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#AF2800',
    ...Shadows.sm,
  },
  segmentedTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentedTabTextActive: {
    color: '#AF2800',
    fontWeight: '800',
  },

  // Input Field
  textInputField: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },

  // Primary Button
  primaryBtnWrap: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#AF2800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnGradient: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Secondary Link
  secondaryLinkBtn: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 4,
  },
  secondaryLinkText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },

  // Selection Card Styles
  choiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    padding: 16,
    marginBottom: 14,
    ...Shadows.sm,
  },
  choiceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  choiceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  choiceBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  choiceBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  choiceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  choiceDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
});
