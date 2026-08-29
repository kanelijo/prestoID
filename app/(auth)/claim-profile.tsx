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
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { sendPushNotification, CHANNELS } from '@/lib/notifications';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ClaimProfileScreen() {
  const router = useRouter();
  const { user, setRole, setBusiness } = useAuthStore();

  // Mode: 'select' (choose between coaching ID vs public test) | 'credentials' (enter coaching credentials)
  const [mode, setMode] = useState<'select' | 'credentials'>('select');

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
      Alert.alert('Missing Fields', 'Please enter both your Coaching ID and Passcode.');
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
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('id, organization_id, business_name, business_type')
        .eq('organization_id', cleanedCode)
        .maybeSingle();

      if (businessError || !business) {
        Alert.alert('Not Found', 'No coaching institute found with this ID. Please check and try again.');
        setIsLoading(false);
        return;
      }

      // Step 2: Find the student profile in the students table
      let query = supabase
        .from('students')
        .select('id, name, user_id')
        .eq('business_id', business.id);

      if (useAadhaar) {
        query = query.eq('aadhaar_number', cleanedPasscode);
      } else {
        query = query.eq('secret_code', cleanedPasscode);
      }

      const { data: studentRecord, error: studentError } = await query.maybeSingle();

      if (studentError || !studentRecord) {
        Alert.alert(
          'Student Record Not Found',
          useAadhaar
            ? 'No matches found for this Aadhaar number. Please check with your teacher.'
            : 'No matches found for this passcode. Please check with your teacher.'
        );
        setIsLoading(false);
        return;
      }

      // Check if student record is already claimed by a different user
      if (studentRecord.user_id && studentRecord.user_id !== user.id) {
        Alert.alert(
          'Already Claimed',
          'This student record has already been linked to a different account. Please contact your teacher.'
        );
        setIsLoading(false);
        return;
      }

      // Get or create persistent device ID
      let deviceId = await AsyncStorage.getItem('device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
        await AsyncStorage.setItem('device_id', deviceId);
      }

      // Step 3: Link student record
      const { error: updateStudentError } = await supabase
        .from('students')
        .update({
          user_id: user.id,
          is_claimed: true,
          device_id: deviceId,
          email: user.email,
        })
        .eq('id', studentRecord.id);

      if (updateStudentError) throw updateStudentError;

      const { error: updateProfileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          name: studentRecord.name,
          email: user.email,
          role: 'student',
          business_id: business.id,
          claimed: true,
          is_external: false,
        });

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
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetContainer}
      >
        <View style={styles.sheet}>
          <View style={styles.handleBar}>
            <View style={styles.handle} />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {mode === 'select' ? (
              // ─── STEP 1: CATEGORIZATION SCREEN (2 BUTTONS) ─────────────────
              <>
                <View style={styles.headerRow}>
                  <View style={styles.iconWrap}>
                    <LinearGradient
                      colors={Gradients.primary as [string, string]}
                      style={styles.iconGradient}
                    >
                      <Ionicons name="school" size={24} color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                  <View style={styles.headerText}>
                    <Text style={styles.title}>Student Portal</Text>
                    <Text style={styles.subtitle}>Choose how you would like to proceed</Text>
                  </View>
                  <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
                    <Ionicons name="close" size={20} color={Colors.text.secondary} />
                  </TouchableOpacity>
                </View>

                {/* Option 1: I Have a Coaching ID */}
                <TouchableOpacity
                  style={styles.selectionCard}
                  activeOpacity={0.85}
                  onPress={() => setMode('credentials')}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.badgeContainer, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.badgeText, { color: '#B91C1C' }]}>INSTITUTE ENROLLED</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.accent.primary} />
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.cardIconBox}>
                      <Ionicons name="business" size={26} color={Colors.accent.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>I have a Coaching ID</Text>
                      <Text style={styles.cardDesc}>
                        Link your coaching institute using Organization Code & Passcode.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featuresList}>
                    <View style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
                      <Text style={styles.featureText}>Digital ID Card & Attendance</Text>
                    </View>
                    <View style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
                      <Text style={styles.featureText}>Batch Tests & Teacher Notes</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Option 2: Practice Public Tests */}
                <TouchableOpacity
                  style={[styles.selectionCard, { borderColor: '#E0E7FF' }]}
                  activeOpacity={0.85}
                  onPress={handleStartPublicPractice}
                  disabled={isPublicLoading}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.badgeContainer, { backgroundColor: '#E0E7FF' }]}>
                      <Text style={[styles.badgeText, { color: '#4338CA' }]}>FREE OPEN ACCESS</Text>
                    </View>
                    {isPublicLoading ? (
                      <ActivityIndicator size="small" color="#4338CA" />
                    ) : (
                      <Ionicons name="rocket" size={18} color="#4338CA" />
                    )}
                  </View>

                  <View style={styles.cardBody}>
                    <View style={[styles.cardIconBox, { backgroundColor: '#EEF2FF' }]}>
                      <Ionicons name="sparkles" size={26} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>Practice Public Tests</Text>
                      <Text style={styles.cardDesc}>
                        No coaching ID needed. Practice free All-India Mock Exams immediately.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featuresList}>
                    <View style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={15} color="#4F46E5" />
                      <Text style={styles.featureText}>Free Mock Tests & Speed Drills</Text>
                    </View>
                    <View style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={15} color="#4F46E5" />
                      <Text style={styles.featureText}>Live Leaderboard & Exam Feed</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              // ─── STEP 2: COACHING CREDENTIALS FORM ─────────────────────────
              <>
                <View style={styles.headerRow}>
                  <TouchableOpacity
                    onPress={() => setMode('select')}
                    style={styles.backBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
                  </TouchableOpacity>
                  <View style={styles.headerText}>
                    <Text style={styles.title}>Coaching Credentials</Text>
                    <Text style={styles.subtitle}>Enter your Institute Code and Passcode</Text>
                  </View>
                  <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
                    <Ionicons name="close" size={20} color={Colors.text.secondary} />
                  </TouchableOpacity>
                </View>

                {/* Organization ID */}
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>ORGANIZATION / COACHING CODE</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="business" size={18} color={Colors.text.tertiary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. ALPHA-101"
                      placeholderTextColor={Colors.text.tertiary}
                      value={businessCode}
                      onChangeText={setBusinessCode}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                {/* Passcode Toggle & Input */}
                <View style={styles.inputSection}>
                  <View style={styles.inputLabelRow}>
                    <Text style={styles.inputLabel}>
                      {useAadhaar ? 'LAST 4 DIGITS OF AADHAAR' : 'SECRET PASSCODE'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setUseAadhaar(!useAadhaar);
                        setPasscode('');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.toggleText}>
                        {useAadhaar ? 'Use Passcode instead' : 'Use Aadhaar instead'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name={useAadhaar ? 'finger-print' : 'lock-closed'}
                      size={18}
                      color={Colors.text.tertiary}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={useAadhaar ? 'e.g. 5678' : 'e.g. ALPHA-789X'}
                      placeholderTextColor={Colors.text.tertiary}
                      value={passcode}
                      onChangeText={setPasscode}
                      autoCapitalize={useAadhaar ? 'none' : 'characters'}
                      autoCorrect={false}
                      keyboardType={useAadhaar ? 'number-pad' : 'default'}
                      maxLength={useAadhaar ? 4 : 20}
                      secureTextEntry={useAadhaar}
                    />
                  </View>
                </View>

                {/* Claim Button */}
                <TouchableOpacity
                  onPress={handleClaim}
                  activeOpacity={0.8}
                  disabled={isLoading}
                  style={{ marginTop: 8 }}
                >
                  <LinearGradient
                    colors={Gradients.primary as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.claimButton}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.claimButtonText}>Verify & Link Profile</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Fallback to Public Practice */}
                <TouchableOpacity
                  onPress={handleStartPublicPractice}
                  style={styles.switchOptionBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.switchOptionText}>
                    Don't have coaching credentials? <Text style={{ fontWeight: '800', color: Colors.accent.primary }}>Practice Public Tests</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    ...Shadows.md,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.card.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 12,
  },
  iconWrap: {},
  iconGradient: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
    lineHeight: 16,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Categorization Selection Cards
  selectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    padding: 16,
    marginBottom: 14,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  cardIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 3,
  },
  cardDesc: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  featuresList: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    gap: 6,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },

  // Inputs
  inputSection: {
    marginBottom: 14,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    ...Shadows.md,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  switchOptionBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  switchOptionText: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
});
