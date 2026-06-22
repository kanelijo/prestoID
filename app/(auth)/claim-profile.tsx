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
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ClaimProfileScreen() {
  const router = useRouter();
  const { user, setRole, setBusiness } = useAuthStore();
  const [businessCode, setBusinessCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [useAadhaar, setUseAadhaar] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(auth)/login');
    }
  };

  const handleClaim = async () => {
    const cleanedCode = businessCode.trim().toUpperCase();
    const cleanedPasscode = passcode.trim();

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
      // Step 1: Find the business by its human-friendly organization_id
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('id, organization_id, business_name, business_type')
        .eq('organization_id', cleanedCode)
        .single();

      if (businessError || !business) {
        Alert.alert('Not Found', 'No organization found with this ID. Please check and try again.');
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

      const { data: studentRecord, error: studentError } = await query.single();

      console.log('[DEBUG] claim-profile query result:', studentRecord);
      console.log('[DEBUG] claim-profile query error:', studentError);

      if (studentError || !studentRecord) {
        Alert.alert(
          'Student Record Not Found',
          (studentError ? `DB Code: ${studentError.code}\nMsg: ${studentError.message}\n\n` : '') +
          (useAadhaar
            ? 'No matches found for this Aadhaar number. Please check with your teacher.'
            : 'No matches found for this passcode. Please check with your teacher.')
        );
        setIsLoading(false);
        return;
      }

      // Check if student record is already claimed by a different user
      if (studentRecord.user_id && studentRecord.user_id !== user.id) {
        Alert.alert(
          'Already Claimed',
          'This student record has already been linked to a different Google account. Please contact your teacher.'
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

      // Step 3: Claim the profile — link auth user to the student record and update profiles
      const { error: updateStudentError } = await supabase
        .from('students')
        .update({
          user_id: user.id,
          is_claimed: true,
          device_id: deviceId,
        })
        .eq('id', studentRecord.id);

      if (updateStudentError) {
        throw updateStudentError;
      }

      const { error: updateProfileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          name: studentRecord.name,
          email: user.email,
          role: 'student',
          business_id: business.id,
          claimed: true,
        });

      if (updateProfileError) {
        throw updateProfileError;
      }

      // Step 4: Update store and navigate
      setRole('student');
      setBusiness(business.id, business.organization_id, business.business_name, business.business_type);

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
      {/* Tap outside to close */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      {/* Bottom Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetContainer}
      >
        <View style={styles.sheet}>
          {/* Drag Handle */}
          <View style={styles.handleBar}>
            <View style={styles.handle} />
          </View>

          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <LinearGradient
                colors={Gradients.primary as [string, string]}
                style={styles.iconGradient}
              >
                <Ionicons name="key" size={22} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Claim Your Profile</Text>
              <Text style={styles.subtitle}>
                Enter the Organization ID and Secret Passcode from your admin/teacher.
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          {/* Organization ID Input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Organization ID</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="business" size={18} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="e.g. ALP-7X9K"
                placeholderTextColor={Colors.text.tertiary}
                value={businessCode}
                onChangeText={setBusinessCode}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Toggle: Passcode or Aadhaar */}
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleButton, !useAadhaar && styles.toggleActive]}
              onPress={() => setUseAadhaar(false)}
            >
              <Text style={[styles.toggleText, !useAadhaar && styles.toggleTextActive]}>Secret Passcode</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, useAadhaar && styles.toggleActive]}
              onPress={() => setUseAadhaar(true)}
            >
              <Text style={[styles.toggleText, useAadhaar && styles.toggleTextActive]}>Aadhaar (Last 4)</Text>
            </TouchableOpacity>
          </View>

          {/* Passcode / Aadhaar Input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>
              {useAadhaar ? 'Last 4 Digits of Aadhaar' : 'Secret Passcode'}
            </Text>
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
                  <Text style={styles.claimButtonText}>Claim My Profile</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Info hint */}
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.text.tertiary} />
            <Text style={styles.infoText}>
              Don't have these? Contact your coaching center.
            </Text>
          </View>
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
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: SCREEN_HEIGHT * 0.75,
    ...Shadows.md,
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
    marginBottom: 20,
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
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
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
  inputSection: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.input,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text.primary,
    fontWeight: '600',
    letterSpacing: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.bg.input,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  claimButton: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.glow,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  infoText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
});
