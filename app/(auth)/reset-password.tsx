import { useEffect, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors, Gradients } from '@/constants/colors';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isVerifying, setIsVerifying] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);

  useEffect(() => {
    async function verifyRecovery() {
      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(String(code));
          if (error) throw error;
          if (data.session) {
            setSessionActive(true);
          }
        } catch (err: any) {
          Alert.alert('Invalid Recovery Link', err.message || 'The password recovery link is expired or invalid.');
          router.replace('/(auth)/login');
        } finally {
          setIsVerifying(false);
        }
      } else {
        setIsVerifying(false);
        // Fallback check if user is already authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setSessionActive(true);
        } else {
          Alert.alert('Access Denied', 'Please request a password reset email link first.');
          router.replace('/(auth)/login');
        }
      }
    }
    verifyRecovery();
  }, [code]);

  const handleResetPassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      Alert.alert('Weak Password', 'Password must contain both letters and numbers.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setIsResetting(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      Alert.alert('Password Updated', 'Your password has been changed successfully. Please log in with your new password.', [
        {
          text: 'Log In',
          onPress: async () => {
            await supabase.auth.signOut();
            router.replace('/(auth)/login');
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Failed', err.message || 'Failed to update password.');
    } finally {
      setIsResetting(false);
    }
  };

  if (isVerifying) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
        <Text style={styles.loadingText}>Verifying recovery link...</Text>
      </View>
    );
  }

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
        {/* Branding */}
        <View style={styles.brandingSection}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoLetter}>P</Text>
          </View>
          <Text style={styles.brandName}>PrestoID</Text>
        </View>

        {/* Heading */}
        <Text style={styles.heading}>Reset Password</Text>
        <Text style={styles.subheading}>Enter your new password below</Text>

        {/* Form */}
        <View style={styles.form}>
          {/* Password */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>New Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Min. 6 characters"
                placeholderTextColor={Colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
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
                placeholder="Confirm new password"
                placeholderTextColor={Colors.text.tertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
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

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleResetPassword}
            activeOpacity={0.8}
            disabled={isResetting || !sessionActive}
          >
            <LinearGradient
              colors={Gradients.primary as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.submitButton, (isResetting || !sessionActive) && styles.buttonDisabled]}
            >
              {isResetting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Update Password</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Back Link */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.backText}>← Back to Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.secondary,
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
  submitButton: {
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
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    alignSelf: 'center',
    marginTop: 28,
    paddingVertical: 8,
  },
  backText: {
    color: Colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
