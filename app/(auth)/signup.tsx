import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

const { height: screenHeight } = Dimensions.get('window');

GoogleSignin.configure({
  webClientId: '698075781767-7me6ngm7q5je5lod3ktc5vjk15er19q0.apps.googleusercontent.com',
  offlineAccess: true,
  scopes: ['https://www.googleapis.com/auth/drive.appdata'],
});

export default function SignupScreen() {
  const router = useRouter();
  const { role: paramRole } = useLocalSearchParams<{ role?: 'student' | 'admin' }>();
  const role = paramRole || 'student';
  const [isLoading, setIsLoading] = useState(false);
  const { setUser, setSession, setRole, setVerified } = useAuthStore();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      try {
        await GoogleSignin.signOut(); // Force clear previous session to show account chooser
      } catch (e) {
        // Ignore
      }
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
      .select('role, business_id, claimed, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    let userRole = profile?.role;

    // If they used Google Sign-In, the trigger might have defaulted them to 'student'.
    // If they selected 'admin' in the UI and haven't claimed/linked anything yet, override it.
    if (!userRole || (userRole !== role && !profile?.business_id && !profile?.claimed)) {
      const { error: roleUpdateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          name: role === 'student' ? 'Student' : (user.user_metadata?.name || 'User'),
          email: user.email,
          role: role,
          business_id: profile?.business_id || null,
          claimed: profile?.claimed || false,
        });

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
      // Check if admin has created their business profile
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
      // Student
      if (profile?.claimed) {
        destination = '/(student)/id-card';
      } else {
        destination = '/(auth)/claim-profile';
      }
    }

    router.replace({
      pathname: '/restore',
      params: { next: destination }
    });
  };

  return (
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
          if (router.canGoBack()) {
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
            <Text style={styles.logoLetter}>P</Text>
          </View>
          <Text style={styles.brandName}>PrestoID</Text>
          <Text style={styles.brandTagline}>Smart Learning Companion</Text>
        </View>

        {/* Auth Card */}
        <View style={styles.authCard}>
          <Text style={styles.heading}>
            {role === 'admin' ? 'Admin Registration' : 'Student Registration'}
          </Text>
          <Text style={styles.subheading}>
            {role === 'admin' 
              ? 'Register with Google to manage your coaching institute' 
              : 'Register with Google to join your coaching center community'}
          </Text>

          {/* Google Button */}
          <TouchableOpacity 
            style={[styles.googleButton, isLoading && styles.buttonDisabled]} 
            activeOpacity={0.8}
            onPress={handleGoogleSignIn}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#AF2800" />
            ) : (
              <>
                <Ionicons name="logo-google" size={22} color="#AF2800" />
                <Text style={styles.googleText}>Sign Up with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footerText}>
            Secure registration powered by Supabase RLS
          </Text>
        </View>
      </View>
    </LinearGradient>
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
    paddingTop: screenHeight * 0.18,
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
    marginBottom: 28,
    lineHeight: 20,
    fontWeight: '500',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F6',
    borderWidth: 1.5,
    borderColor: '#AF2800',
    borderRadius: 16,
    height: 56,
    width: '100%',
    shadowColor: '#AF2800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleText: {
    color: '#AF2800',
    fontSize: 16,
    fontWeight: '700',
  },
  footerText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 20,
    fontWeight: '500',
  },
});
